import { fillField, expectField } from "./edit-fields";
import { test, expect } from "@playwright/test";
const API_ORIGIN = process.env.BROWSER_API_ORIGIN || "http://127.0.0.1:8787";
test("a direction becomes an action and survives offline reload", async ({
  page,
  context,
}) => {
  await page.goto("./");
  await expect(
    page.getByRole("heading", { name: "今天", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "写下我的方向" }).click();
  await fillField(page, "我想过怎样的生活", "拥有持续写作的生活");
  await fillField(page, "一年后，希望看到的一个变化", "完成十二篇文章");
  await fillField(page, "这个月，推进的一个项目", "写完第一篇");
  await page.getByRole("button", { name: "回到今天，选择行动" }).click();
  await page.getByLabel("添加今天的行动").fill("写出第一个段落");
  await page.getByRole("button", { name: "添加", exact: true }).click();
  await page.getByRole("checkbox", { name: "写出第一个段落" }).check();
  await page.getByRole("button", { name: "花一分钟，想一想" }).click();
  await page.getByText("记一句，或调整下一步", { exact: true }).click();
  await page.getByLabel("此刻，我注意到……").fill("我在反复找资料，没有开始写");
  await page.getByLabel("如果再次遇到这个情境，我就……").fill("先写两分钟");
  await page.getByRole("button", { name: "记录这次停顿" }).click();
  await fillField(page, "今天，什么行动有帮助？", "先写一个段落");
  await page.getByRole("button", { name: "回顾", exact: true }).click();
  await expect(
    page.getByText("我在反复找资料，没有开始写", { exact: true }),
  ).toBeVisible();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    await new Promise((r) => setTimeout(r, 500));
  });
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "回顾", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "今天", exact: true }).click();
  await expect(
    page.getByRole("checkbox", { name: "写出第一个段落" }),
  ).toBeChecked();
  await expectField(page, "今天，什么行动有帮助？", "先写一个段落");
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > innerWidth,
  );
  expect(overflow).toBe(false);
  await page.screenshot({ path: "docs/mobile-preview.png", fullPage: true });
});
test("limits actions and can export private records", async ({ page }) => {
  await page.goto("./");
  for (let i = 1; i <= 3; i++) {
    await page.getByLabel("添加今天的行动").fill("行动 " + i);
    await page.getByRole("button", { name: "添加", exact: true }).click();
  }
  await expect(page.getByLabel("添加今天的行动")).toBeDisabled();
  await page.getByRole("button", { name: "修改行动：行动 2" }).click();
  await page.getByRole("button", { name: "移除这项行动", exact: true }).click();
  await expect(page.getByLabel("添加今天的行动")).toBeEnabled();
  await page.getByRole("button", { name: "设置", exact: true }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "保存备份到文件" }).click();
  expect((await downloadPromise).suggestedFilename()).toMatch(
    /^compass-.*\.json$/,
  );
});
test("cloud sync exposes conflicts without silently overwriting either version", async ({
  page,
  request,
}) => {
  const { readFile } = await import("node:fs/promises");
  const token = (await readFile(".dev.vars", "utf8")).match(
    /^OWNER_TOKEN=(.+)$/m,
  )![1];
  const headers = { Authorization: "Bearer " + token };
  await request.delete(API_ORIGIN + "/api/data", { headers });
  await page.goto("./");
  await page.getByRole("button", { name: "设置", exact: true }).click();
  await page.getByText("管理员恢复入口", { exact: true }).click();
  await page.getByLabel("个人访问密钥").fill(token);
  await page.getByRole("button", { name: "连接并同步" }).click();
  await expect(
    page.getByRole("button", { name: /已同步到云端/ }),
  ).toBeVisible();
  const remote = await (
    await request.get(API_ORIGIN + "/api/state", { headers })
  ).json();
  remote.state.direction.vision = "云端方向";
  expect(
    (
      await request.put(API_ORIGIN + "/api/state", { headers, data: remote })
    ).status(),
  ).toBe(200);
  await page.getByRole("button", { name: "方向", exact: true }).click();
  await fillField(page, "我想过怎样的生活", "本机方向");
  await expect(
    page.getByRole("heading", { name: "本机与云端都有修改" }),
  ).toBeVisible();
  expect(
    (await (await request.get(API_ORIGIN + "/api/state", { headers })).json())
      .state.direction.vision,
  ).toBe("云端方向");
  await expectField(page, "我想过怎样的生活", "本机方向");
  await page.getByRole("button", { name: "保留本机版本", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "本机与云端都有修改" }),
  ).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: /已同步到云端/ }),
  ).toBeVisible();
  expect(
    (await (await request.get(API_ORIGIN + "/api/state", { headers })).json())
      .state.direction.vision,
  ).toBe("本机方向");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "今天", exact: true }).click();
  await page.screenshot({ path: "docs/desktop-preview.png", fullPage: true });
  await request.delete(API_ORIGIN + "/api/data", { headers });
});
test("PWA scope and resource URLs stay within the application base", async ({
  page,
  baseURL,
}) => {
  await page.goto("./");
  const root = new URL("./", baseURL!);
  const manifest = await page.evaluate(async () => {
    const link = document.querySelector<HTMLLinkElement>("link[rel=manifest]")!;
    return { url: link.href, body: await (await fetch(link.href)).json() };
  });
  expect(manifest.url).toBe(new URL("manifest.webmanifest", root).href);
  expect(manifest.body.scope).toBe(root.pathname);
  expect(manifest.body.start_url).toBe(root.pathname);
  expect(
    manifest.body.icons.every((icon: { src: string }) =>
      icon.src.startsWith(root.pathname),
    ),
  ).toBe(true);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  expect(
    await page.evaluate(
      async () => (await navigator.serviceWorker.ready).scope,
    ),
  ).toBe(root.href);
});
test("cross-origin authentication failures remain readable", async ({
  page,
}) => {
  test.skip(
    !process.env.BROWSER_API_ORIGIN,
    "only for the separate-origin build",
  );
  await page.goto("./");
  await page.getByRole("button", { name: "设置", exact: true }).click();
  await page.getByText("管理员恢复入口", { exact: true }).click();
  await page
    .getByLabel("个人访问密钥")
    .fill("incorrect-secret-that-is-at-least-32-characters");
  await page.getByRole("button", { name: "连接并同步" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "请输入正确的个人访问密钥。" }),
  ).toBeVisible();
});
test("test notification errors are visible beside the sending button on mobile", async ({
  page,
}) => {
  await page.route("**/api/push/test", (route) =>
    route.fulfill({
      status: 502,
      contentType: "application/json",
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({
        error: "测试推送失败：upstream unavailable",
        code: "PUSH_TEST_FAILED",
      }),
    }),
  );
  const { readFile } = await import("node:fs/promises");
  const owner = (await readFile(".dev.vars", "utf8")).match(
    /^OWNER_TOKEN=(.+)$/m,
  )![1];
  await page.goto("./");
  await page.getByRole("button", { name: "设置", exact: true }).click();
  await page.getByText("管理员恢复入口", { exact: true }).click();
  await page.getByLabel("个人访问密钥").fill(owner);
  await page.getByRole("button", { name: "连接并同步" }).click();
  await expect(
    page.getByRole("button", { name: /已同步到云端/ }),
  ).toBeVisible();
  await page.getByText("通知诊断", { exact: true }).click();
  await page.getByRole("button", { name: "发送测试提醒", exact: true }).click();
  const feedback = page.getByTestId("push-feedback");
  await expect(feedback).toContainText("测试推送失败");
  await expect(feedback).toBeInViewport();
});
