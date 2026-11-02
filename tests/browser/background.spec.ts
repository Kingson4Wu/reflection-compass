import { test, expect } from "@playwright/test";
test("cold-opens offline with saved actions after all app pages close", async ({
  page,
  context,
  baseURL,
}) => {
  await page.goto("./");
  await page.getByLabel("添加今天的行动").fill("关闭应用后的恢复测试");
  await page.getByRole("button", { name: "添加", exact: true }).click();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect(page.getByRole("button", { name: /本机已保存/ })).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("checkbox", { name: "关闭应用后的恢复测试" }),
  ).toBeVisible();
  const app = new URL("./", baseURL!);
  await context.newPage();
  await page.close();
  expect(context.pages().every((p) => !p.url().startsWith(app.href))).toBe(
    true,
  );
  const reopened = await context.newPage();
  await context.setOffline(true);
  await reopened.goto(
    app.href +
      "?view=reflect&day=2000-01-01&question=" +
      encodeURIComponent("离线冷启动反思"),
  );
  await expect(reopened.getByRole("heading", { name: "停顿" })).toBeVisible();
  await expect(
    reopened.getByRole("heading", { name: "离线冷启动反思" }),
  ).toBeVisible();
  await expect(
    reopened.getByText("这是一条较早的提醒。此刻的选择，留在今天就好。", {
      exact: true,
    }),
  ).toBeVisible();
  await reopened.getByRole("button", { name: "今天", exact: true }).click();
  await expect(
    reopened.getByRole("heading", { name: "今天", exact: true }),
  ).toBeVisible();
  await expect(
    reopened.getByRole("checkbox", { name: "关闭应用后的恢复测试" }),
  ).toBeVisible();
});
test("does not claim local data is saved before the storage acknowledgement", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const descriptor = Object.getOwnPropertyDescriptor(
      IDBTransaction.prototype,
      "oncomplete",
    )!;
    Object.defineProperty(IDBTransaction.prototype, "oncomplete", {
      configurable: true,
      get: descriptor.get,
      set(handler) {
        descriptor.set!.call(
          this,
          handler
            ? function (this: IDBTransaction, event: Event) {
                setTimeout(() => handler.call(this, event), 500);
              }
            : handler,
        );
      },
    });
  });
  await page.goto("./");
  await page.getByLabel("添加今天的行动").fill("等待保存确认");
  await page.getByRole("button", { name: "添加", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /正在保存到本机/ }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /本机已保存/ })).toBeVisible();
});
