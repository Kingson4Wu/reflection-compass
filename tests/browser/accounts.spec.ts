import { fillField, expectField } from "./edit-fields";
import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { createHash, randomUUID, randomBytes } from "node:crypto";
const API = process.env.BROWSER_API_ORIGIN || "http://127.0.0.1:8787";
test.use({ serviceWorkers: "block" });
test("Google account switching isolates local drafts, cloud state and administration", async ({
  page,
  request,
  context,
}) => {
  const owner = (await readFile(".dev.vars", "utf8")).match(
    /^OWNER_TOKEN=(.+)$/m,
  )![1];
  const headers = { Authorization: "Bearer " + owner };
  await request.delete(API + "/api/data", { headers });
  const members = await (
    await request.get(API + "/api/members", { headers })
  ).json();
  for (const member of members)
    if (member.seat !== 1)
      await request.delete(API + "/api/members/" + member.id, { headers });
  const invitation = await (
    await request.post(API + "/api/members", {
      headers,
      data: { email: "browser.friend@gmail.com" },
    })
  ).json();
  expect(invitation.seat).toBe(2);
  const memberToken = "dv_" + randomBytes(32).toString("hex"),
    deviceId = randomUUID(),
    hash = createHash("sha256").update(memberToken).digest("hex");
  const sql = `UPDATE accounts SET status='active',subject='browser-friend',invited_until=NULL WHERE id='${invitation.id}'; INSERT INTO member2_devices(id,name,token_hash,last_seen) VALUES('${deviceId}','测试朋友设备','${hash}',0); INSERT INTO login_sessions VALUES('${hash}','${invitation.id}','${deviceId}',${Date.now() + 86400000});`;
  const seed = spawnSync(
    "npx",
    [
      "wrangler",
      "d1",
      "execute",
      "compass",
      "--local",
      "--persist-to",
      ".wrangler/split-test-state",
      "--command",
      sql,
    ],
    { encoding: "utf8" },
  );
  expect(seed.status, seed.stderr).toBe(0);
  await page.route("**/api/auth/config", (route) =>
    route.fulfill({ json: { configured: true, clientId: "test-client" } }),
  );
  await page.route("**/api/auth/challenge", (route) =>
    route.fulfill({ json: { id: randomUUID(), nonce: "test-nonce" } }),
  );
  await page.route("https://accounts.google.com/gsi/client", (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: `window.google={accounts:{id:{initialize(options){this.options=options},renderButton(element){const button=document.createElement('button');button.textContent='Google 测试账号';button.onclick=()=>this.options.callback({credential:'mock-google-credential'});element.appendChild(button)}}}};`,
    }),
  );
  await page.route("**/api/auth/google", (route) =>
    route.fulfill({
      json: {
        id: deviceId,
        name: "测试朋友设备",
        token: memberToken,
        expiresAt: Date.now() + 86400000,
        user: {
          id: invitation.id,
          email: "browser.friend@gmail.com",
          name: "Friend",
          role: "member",
        },
      },
    }),
  );
  const settings = async () =>
    page.getByRole("button", { name: "设置", exact: true }).click();
  const direction = async () =>
    page.getByRole("button", { name: "方向", exact: true }).click();

  const ownerLogin = async () => {
    await settings();
    await page.getByText("管理员恢复入口", { exact: true }).click();
    await page.getByLabel("个人访问密钥").fill(owner);
    await page.getByRole("button", { name: "连接并同步" }).click();
    await expect(page.locator("button.sync")).toContainText("已同步到云端");
  };
  const memberLogin = async () => {
    await settings();
    await page
      .getByRole("button", { name: /使用 Google 登录|切换账号/ })
      .click();
    await page
      .getByRole("button", { name: "Google 测试账号", exact: true })
      .click();
    await expect(
      page.getByText("browser.friend@gmail.com", { exact: true }),
    ).toBeVisible();
    await expect(page.locator("button.sync")).toContainText("已同步到云端");
  };
  try {
    await page.goto("./");
    await ownerLogin();
    await direction();
    await fillField(page, "我想过怎样的生活", "管理员的私人方向");
    await page.locator("button.sync").click();
    await expect(page.locator("button.sync")).toContainText("已同步到云端");
    await memberLogin();
    await expect(page.getByRole("heading", { name: "邀请与成员" })).toHaveCount(
      0,
    );
    await direction();
    await expectField(page, "我想过怎样的生活", "");
    await context.setOffline(true);
    await fillField(page, "我想过怎样的生活", "朋友的离线方向");
    await expect(page.locator("button.sync")).toContainText("本机已保存");
    await settings();
    await page.getByRole("button", { name: "退出此设备", exact: true }).click();
    await direction();
    await expectField(page, "我想过怎样的生活", "");
    await context.setOffline(false).catch(() => {});
    await ownerLogin();
    await direction();
    await expectField(page, "我想过怎样的生活", "管理员的私人方向");
    await memberLogin();
    await direction();
    await expectField(page, "我想过怎样的生活", "朋友的离线方向");
    const remote = await (
      await request.get(API + "/api/state", {
        headers: { Authorization: "Bearer " + memberToken },
      })
    ).json();
    expect(remote.state.direction.vision).toBe("朋友的离线方向");
  } finally {
    await context.setOffline(false).catch(() => {});
    await request.delete(API + "/api/members/" + invitation.id, { headers });
    await request.delete(API + "/api/data", { headers });
  }
});
test("fresh visitor drafts remain in the guest workspace when the owner signs in", async ({
  page,
  request,
}) => {
  const owner = (await readFile(".dev.vars", "utf8")).match(
    /^OWNER_TOKEN=(.+)$/m,
  )![1];
  const headers = { Authorization: "Bearer " + owner };
  await request.delete(API + "/api/data", { headers });
  await page.goto("./");
  await page.getByRole("button", { name: "方向", exact: true }).click();
  await fillField(page, "我想过怎样的生活", "访客自己的草稿");
  await expect(page.locator("button.sync")).toContainText("本机已保存");
  await page.getByRole("button", { name: "设置", exact: true }).click();
  await page.getByText("管理员恢复入口", { exact: true }).click();
  await page.getByLabel("个人访问密钥").fill(owner);
  await page.getByRole("button", { name: "连接并同步" }).click();
  await expect(page.locator("button.sync")).toContainText("已同步到云端");
  await page.getByRole("button", { name: "方向", exact: true }).click();
  await expectField(page, "我想过怎样的生活", "");
  await page.getByRole("button", { name: "设置", exact: true }).click();
  await page.getByRole("button", { name: "退出此设备", exact: true }).click();
  await page.getByRole("button", { name: "方向", exact: true }).click();
  await expectField(page, "我想过怎样的生活", "访客自己的草稿");
  await request.delete(API + "/api/data", { headers });
});
test("administrator linking remains discoverable before signing in", async ({
  page,
}) => {
  await page.route("**/api/auth/config", (route) =>
    route.fulfill({ json: { configured: true, clientId: "test-client" } }),
  );
  await page.goto("./?view=settings");
  const link = page.getByRole("button", {
    name: "将现有数据绑定到 Google 账号",
    exact: true,
  });
  await expect(link).toBeVisible();
  await expect(page.getByLabel("个人访问密钥")).toBeHidden();
  await link.click();
  await expect(page.getByLabel("个人访问密钥")).toBeVisible();
  await expect(page.getByRole("alert")).toContainText("先验证管理员身份");
});
