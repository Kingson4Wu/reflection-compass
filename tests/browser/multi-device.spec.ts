import { fillField, expectField } from "./edit-fields";
import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createBackup } from "../../src/backup";
import { emptyState } from "../../src/domain";
const API = process.env.BROWSER_API_ORIGIN || "http://127.0.0.1:8787";
async function owner() {
  return (await readFile(".dev.vars", "utf8")).match(/^OWNER_TOKEN=(.+)$/m)![1];
}
async function login(page: Page, name: string) {
  await page.goto("./");
  await page.getByRole("button", { name: "设置", exact: true }).click();

  await page.getByText("管理员恢复入口", { exact: true }).click();
  await page.getByLabel("个人访问密钥").fill(await owner());
  await page.getByRole("button", { name: "连接并同步" }).click();
  await expect(
    page.getByRole("button", { name: /已同步到云端/ }),
  ).toBeVisible();
  await page.getByText("设备管理", { exact: true }).click();
  await page.getByLabel("这台设备的名称").fill(name);
  await page.getByRole("button", { name: "保存设备名称", exact: true }).click();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
}
test("two devices merge offline changes, recover the outbox on reload and remember login", async ({
  browser,
  request,
  baseURL,
}) => {
  const headers = { Authorization: "Bearer " + (await owner()) };
  await request.delete(API + "/api/data", { headers });
  const phoneContext = await browser.newContext({ baseURL }),
    macContext = await browser.newContext({ baseURL });
  try {
    const phone = await phoneContext.newPage(),
      mac = await macContext.newPage();
    await login(phone, "测试手机");
    await login(mac, "测试电脑");
    await phone.bringToFront();
    await phoneContext.setOffline(true);
    await phone.getByRole("button", { name: "方向", exact: true }).click();
    await fillField(phone, "我想过怎样的生活", "手机离线愿景");
    await expect(
      phone.getByRole("button", { name: /本机已保存/ }),
    ).toBeVisible();
    await phone.reload();
    await phone.getByRole("button", { name: "方向", exact: true }).click();
    await expectField(phone, "我想过怎样的生活", "手机离线愿景");
    await mac.bringToFront();
    await mac.getByRole("button", { name: "方向", exact: true }).click();
    await fillField(mac, "这个月，推进的一个项目", "电脑在线项目");
    await mac.locator("button.sync").click();
    await expect(
      mac.getByRole("button", { name: /已同步到云端/ }),
    ).toBeVisible();
    await phone.bringToFront();
    await phoneContext.setOffline(false);
    await expect(
      phone.getByRole("button", { name: /已同步到云端/ }),
    ).toBeVisible({ timeout: 15000 });
    await expect
      .poll(
        async () =>
          (await (await request.get(API + "/api/state", { headers })).json())
            .state.direction,
      )
      .toMatchObject({ vision: "手机离线愿景", project: "电脑在线项目" });
    await mac.reload();
    await expect(
      mac.getByRole("button", { name: /已同步到云端/ }),
    ).toBeVisible();
    await mac.getByRole("button", { name: "方向", exact: true }).click();
    await expectField(mac, "我想过怎样的生活", "手机离线愿景");
  } finally {
    await phoneContext.close();
    await macContext.close();
    await request.delete(API + "/api/data", { headers });
  }
});
test("backup import previews content, rejects corruption and supports undo", async ({
  page,
}) => {
  await page.goto("./");
  await page.getByRole("button", { name: "设置", exact: true }).click();
  const state = emptyState();
  state.direction.vision = "来自备份的愿景";
  const backup = await createBackup(state);
  await page.getByLabel("选择备份文件（先预览，不会立即修改）").setInputFiles({
    name: "backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(backup)),
  });
  await expect(page.getByRole("heading", { name: "备份预览" })).toBeVisible();
  await page.getByRole("button", { name: "补充导入", exact: true }).click();
  await page.getByRole("button", { name: "方向", exact: true }).click();
  await expectField(page, "我想过怎样的生活", "来自备份的愿景");
  await page.getByRole("button", { name: "设置", exact: true }).click();
  await page.getByRole("button", { name: "撤销上次本机导入" }).click();
  await page.getByRole("button", { name: "方向", exact: true }).click();
  await expectField(page, "我想过怎样的生活", "");
  await page.getByRole("button", { name: "设置", exact: true }).click();
  backup.state.direction.vision = "篡改内容";
  await page.getByLabel("选择备份文件（先预览，不会立即修改）").setInputFiles({
    name: "bad.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(backup)),
  });
  await expect(
    page.getByText("备份校验失败，文件可能损坏或被修改。", { exact: true }),
  ).toBeVisible();
});
