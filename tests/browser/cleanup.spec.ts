import { test, expect } from "@playwright/test";
test("settings has one export entry and keeps infrequent controls behind clear disclosures", async ({
  page,
}) => {
  await page.goto("./?view=settings");
  await expect(
    page.getByRole("button", { name: "保存备份到文件", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "导出 JSON 备份", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "刷新发送记录", exact: true }),
  ).toBeHidden();
  await expect(
    page.getByRole("button", { name: "删除全部数据", exact: true }),
  ).toBeHidden();
  await page.getByText("通知诊断", { exact: true }).click();
  await expect(
    page.getByRole("button", { name: "刷新发送记录", exact: true }),
  ).toBeVisible();
  await page.getByText("删除数据", { exact: true }).click();
  await expect(
    page.getByRole("button", { name: "删除全部数据", exact: true }),
  ).toBeDisabled();
});
test("all five views remain usable on phone and desktop", async ({ page }) => {
  const { mkdir } = await import("node:fs/promises");
  await mkdir(".wrangler/ui-audit", { recursive: true });
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 1440, height: 1000 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("./");
    for (const label of ["今天", "方向", "停顿", "回顾", "设置"]) {
      await page.getByRole("button", { name: label, exact: true }).click();
      await expect(page.locator("main h1")).toBeVisible();
      await expect(
        page.getByRole("button", { name: label, exact: true }),
      ).toHaveAttribute("aria-current", "page");
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
      ).toBe(false);
      await page.screenshot({
        path: `.wrangler/ui-audit/${viewport.width}-${label}.png`,
        fullPage: true,
        animations: "disabled",
      });
    }
  }
});
test("signed-in members see a compact account area and no administrator recovery", async ({
  page,
  baseURL,
}) => {
  const { emptyState } = await import("../../src/domain");
  const base = new URL(baseURL!).pathname;
  await page.addInitScript(
    ({ base }) =>
      localStorage.setItem(
        "compass-auth:" + base,
        JSON.stringify({
          token: "dv_" + "a".repeat(64),
          id: "audit-device",
          name: "我的设备",
          remember: true,
          accountId: "audit-member",
          user: {
            id: "audit-member",
            email: "member@example.com",
            name: "Member",
            role: "member",
          },
        }),
      ),
    { base },
  );
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    const body = path.endsWith("/auth/config")
      ? { configured: true, clientId: "test" }
      : path.endsWith("/sync")
        ? { state: emptyState(), revision: 1, results: [] }
        : path.endsWith("/devices")
          ? { devices: [], targetId: null }
          : [];
    return route.fulfill({
      status: path.endsWith("/members") ? 403 : 200,
      json: body,
    });
  });
  await page.goto("./?view=settings");
  await expect(
    page.getByText("member@example.com", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "退出此设备", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("管理员恢复入口", { exact: true })).toHaveCount(
    0,
  );
  await expect(page.getByLabel("这台设备的名称")).toBeHidden();
  await page.getByText("设备管理", { exact: true }).click();
  await expect(page.getByLabel("这台设备的名称")).toBeVisible();
});
test("cancelling the system backup dialog is not reported as a saved backup", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "canShare", {
      configurable: true,
      value: () => true,
    });
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async () => {
        throw new DOMException("Cancelled", "AbortError");
      },
    });
  });
  await page.goto("./?view=settings");
  await page
    .getByRole("button", { name: "保存备份到文件", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "已取消保存" }),
  ).toBeVisible();
});
