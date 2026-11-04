import { test, expect } from "@playwright/test";

test("notification registration refreshes devices and offers an explicit switch beside the result", async ({
  page,
}) => {
  let subscribed = false,
    target = false;
  let deviceRequests = 0,
    initialFinished = false;
  let releaseInitial!: () => void;
  const initialWait = new Promise<void>((resolve) => {
    releaseInitial = resolve;
  });
  await page.addInitScript(() => {
    localStorage.setItem(
      "compass-auth:/reflection-compass/",
      JSON.stringify({
        token: "dv_" + "a".repeat(64),
        id: "current-phone",
        name: "iPhone",
        remember: true,
        accountId: "owner",
      }),
    );
    Object.defineProperty(window, "PushManager", { value: function () {} });
    Object.defineProperty(window, "Notification", {
      value: { requestPermission: async () => "granted" },
    });
    Object.defineProperty(navigator, "serviceWorker", {
      value: {
        register: async () => ({}),
        ready: Promise.resolve({
          pushManager: {
            getSubscription: async () => ({
              toJSON: () => ({
                endpoint: "https://web.push.apple.com/current",
                keys: { p256dh: "a".repeat(87), auth: "b".repeat(22) },
              }),
            }),
          },
        }),
      },
    });
  });
  await page.route("**/api/config", (route) =>
    route.fulfill({
      json: { publicKey: "a".repeat(87), pushReady: true, subscribed: true },
    }),
  );
  await page.route("**/api/subscription", (route) => {
    if (route.request().method() === "POST") subscribed = true;
    return route.fulfill({ json: { ok: true, target: false } });
  });
  await page.route("**/api/devices", async (route) => {
    const first = ++deviceRequests === 1;
    const json = {
      currentId: "current-phone",
      targetId: target ? "current-phone" : "legacy-phone",
      devices: [
        {
          id: "current-phone",
          name: "iPhone",
          current: true,
          subscribed,
          target,
          last_seen: Date.now(),
        },
      ],
    };
    if (first) await initialWait;
    await route.fulfill({ json });
    if (first) initialFinished = true;
  });
  await page.route("**/api/devices/target", (route) => {
    target = true;
    return route.fulfill({ json: { ok: true } });
  });
  await page.route("**/api/push/test", async (route) => {
    expect(route.request().postDataJSON()).toEqual({ currentDevice: true });
    await route.fulfill({ json: { accepted: true } });
  });
  await page.goto("./?view=settings", { waitUntil: "domcontentloaded" });
  await page.getByText("设备管理", { exact: true }).click();
  await expect.poll(() => deviceRequests).toBe(1);
  await page
    .getByRole("button", { name: "在这台设备开启通知", exact: true })
    .click();
  await expect(page.getByText(/已开启通知，尚未选为提醒设备/)).toBeVisible();
  releaseInitial();
  await expect.poll(() => initialFinished).toBe(true);
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 0)));
  await expect(page.getByText(/已开启通知，尚未选为提醒设备/)).toBeVisible();
  await page
    .getByRole("button", { name: "将提醒切换到这台设备", exact: true })
    .click();
  await expect(page.getByText(/^接收日常提醒/)).toBeVisible();
  await page.getByText("通知诊断", { exact: true }).click();
  await page.getByRole("button", { name: "发送测试提醒", exact: true }).click();
  await expect(page.getByTestId("push-feedback")).toContainText(
    "推送服务已接受请求",
  );
});

test("remembered login recovers from IndexedDB on a new page after localStorage loss and stays signed out after logout", async ({
  page,
  context,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      "compass-auth:/reflection-compass/",
      JSON.stringify({
        token: "dv_" + "a".repeat(64),
        id: "current-phone",
        name: "iPhone",
        remember: true,
        accountId: "owner",
      }),
    ),
  );
  await page.goto("./?view=settings", { waitUntil: "domcontentloaded" });
  await expect(
    page.getByRole("button", { name: "退出此设备", exact: true }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        async () =>
          new Promise<unknown>((resolve, reject) => {
            const open = indexedDB.open("keyval-store", 1);
            open.onsuccess = () => {
              const db = open.result;
              const read = db
                .transaction("keyval")
                .objectStore("keyval")
                .get("compass-auth:/reflection-compass/");
              read.onsuccess = () => {
                resolve(read.result?.token);
                db.close();
              };
              read.onerror = reject;
            };
            open.onerror = reject;
          }),
      ),
    )
    .toBe("dv_" + "a".repeat(64));
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.close();
  const fresh = await context.newPage();
  await fresh.goto("./?view=settings", { waitUntil: "domcontentloaded" });
  await fresh.bringToFront();
  await expect(
    fresh.getByRole("button", { name: "退出此设备", exact: true }),
  ).toBeVisible();
  await fresh.getByRole("button", { name: "退出此设备", exact: true }).click();
  await expect(
    fresh.getByRole("button", { name: "退出此设备", exact: true }),
  ).toHaveCount(0);
  await fresh.reload();
  await fresh.getByText("通知诊断", { exact: true }).click();
  await expect(
    fresh.getByRole("button", { name: "发送测试提醒", exact: true }),
  ).toBeDisabled();
});
