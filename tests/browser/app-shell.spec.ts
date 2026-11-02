import { fillField, expectField } from "./edit-fields";
import { test, expect } from "@playwright/test";
test.use({ hasTouch: true, isMobile: true });
test("keeps navigation and header fixed while only content scrolls and restores tab positions", async ({
  page,
}) => {
  await page.goto("./?view=settings");
  await page.getByText("提醒时间与免打扰", { exact: true }).click();
  const content = page.getByTestId("page-scroll");
  await expect(content).toBeVisible();
  const header = page.locator("main > header");
  const before = await header.boundingBox();
  await content.evaluate((el) => (el.scrollTop = 350));
  await expect
    .poll(() => content.evaluate((el) => el.scrollTop))
    .toBeGreaterThan(100);
  expect(await page.evaluate(() => scrollY)).toBe(0);
  expect((await header.boundingBox())?.y).toBe(before?.y);
  await page.getByRole("button", { name: "方向", exact: true }).click();
  expect(await content.evaluate((el) => el.scrollTop)).toBe(0);
  await page.getByRole("button", { name: "设置", exact: true }).click();
  await expect
    .poll(() => content.evaluate((el) => el.scrollTop))
    .toBeGreaterThan(100);
  const nav = await page
    .getByRole("navigation", { name: "主导航" })
    .boundingBox();
  expect(nav!.y + nav!.height).toBeLessThanOrEqual(845);
});
test("maintains a bounded shell and accessible input sizes in portrait and landscape", async ({
  page,
}) => {
  for (const size of [
    { width: 320, height: 568 },
    { width: 844, height: 390 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(size);
    await page.goto("./?view=direction");
    await expect(page.getByTestId("page-scroll")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollHeight > innerHeight + 1,
      ),
    ).toBe(false);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
    const font = await page
      .locator("textarea")
      .first()
      .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(font).toBeGreaterThanOrEqual(16);
  }
});
test("uses an app dialog for destructive imports and Escape cancels without changing records", async ({
  page,
}) => {
  const { createBackup } = await import("../../src/backup");
  const { emptyState } = await import("../../src/domain");
  await page.goto("./?view=settings");
  const state = emptyState();
  state.direction.vision = "Should not be imported";
  await page.getByLabel("选择备份文件（先预览，不会立即修改）").setInputFiles({
    name: "test.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(await createBackup(state))),
  });
  await page.getByRole("button", { name: "用备份替换当前内容" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(
    page.getByRole("button", { name: "用备份替换当前内容" }),
  ).toBeFocused();
  await page.getByRole("button", { name: "方向", exact: true }).click();
  await expectField(page, "我想过怎样的生活", "");
  await page.getByRole("button", { name: "设置", exact: true }).click();
  await page.getByLabel("选择备份文件（先预览，不会立即修改）").setInputFiles({
    name: "test.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(await createBackup(state))),
  });
  await page.getByRole("button", { name: "用备份替换当前内容" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "确认继续", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await page.getByRole("button", { name: "方向", exact: true }).click();
  await expectField(page, "我想过怎样的生活", "Should not be imported");
});
test("adapts the content viewport to a keyboard without hiding the focused field", async ({
  page,
}) => {
  await page.goto("./?view=direction");
  await page
    .getByRole("button", { name: "我不愿牺牲的事", exact: true })
    .click();
  await page.getByRole("dialog").getByRole("textbox").focus();
  await page.evaluate(() => {
    Object.defineProperty(window.visualViewport!, "height", {
      configurable: true,
      value: 480,
    });
    window.visualViewport!.dispatchEvent(new Event("resize"));
  });
  await expect(page.locator(".app-shell")).toHaveClass(/keyboard-open/);
  await expect(page.locator(".sidebar")).toBeHidden();
  await expect
    .poll(async () => {
      const input = await page
        .getByRole("dialog")
        .getByRole("textbox")
        .boundingBox();
      const area = await page.getByRole("dialog").boundingBox();
      return input!.y + input!.height <= area!.y + area!.height;
    })
    .toBe(true);
  await page.evaluate(() => {
    Object.defineProperty(window.visualViewport!, "height", {
      configurable: true,
      value: innerHeight,
    });
    window.visualViewport!.dispatchEvent(new Event("resize"));
  });
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "完成", exact: true })
    .click();
  await expect(page.getByRole("navigation", { name: "主导航" })).toBeVisible();
});
test("preserves expanded settings and supports back navigation without scrolling the document", async ({
  page,
}) => {
  await page.goto("./?view=settings");
  await page.getByText("提醒时间与免打扰", { exact: true }).click();
  await page.getByRole("button", { name: "方向", exact: true }).click();
  await page.goBack();
  await expect(page.locator("main h1")).toHaveText("设置");
  await expect(page.getByLabel("提醒时区")).toBeVisible();
  expect(await page.evaluate(() => scrollY)).toBe(0);
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(
    await page
      .locator(".page-transition")
      .evaluate((el) => getComputedStyle(el).animationName),
  ).toBe("none");
});
