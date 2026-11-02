import { test, expect } from "@playwright/test";
test("direction uses a summary list and a focused editor that saves before closing", async ({
  page,
}) => {
  await page.goto("./?view=direction");
  await expect(page.getByRole("textbox")).toHaveCount(0);
  await page
    .getByRole("button", { name: "我想过怎样的生活", exact: true })
    .click();
  const editor = page.getByRole("dialog", {
    name: "我想过怎样的生活",
    exact: true,
  });
  await expect(editor).toBeVisible();
  await editor.getByRole("textbox").fill("更专注地生活");
  await editor.getByRole("button", { name: "完成", exact: true }).click();
  await expect(editor).toBeHidden();
  await expect(
    page.getByRole("button", { name: "我想过怎样的生活", exact: true }),
  ).toContainText("更专注地生活");
  await page.reload();
  await expect(
    page.getByRole("button", { name: "我想过怎样的生活", exact: true }),
  ).toContainText("更专注地生活");
});
test("changing the reflection question keeps the current observation", async ({
  page,
}) => {
  const { QUESTIONS } = await import("../../src/domain");
  await page.goto("./?view=reflect");
  await page.getByText("记一句，或调整下一步", { exact: true }).click();
  await page
    .getByRole("textbox", { name: "此刻，我注意到……", exact: true })
    .fill("正在写的观察");
  await page.getByRole("button", { name: "选择一个问题", exact: true }).click();
  await page
    .getByRole("dialog", { name: "选择一个问题", exact: true })
    .getByRole("button", { name: QUESTIONS[1], exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: QUESTIONS[1], exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "此刻，我注意到……", exact: true }),
  ).toHaveValue("正在写的观察");
});
test("hides scrollbars without disabling content scrolling", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 600 });
  await page.goto("./?view=settings");
  await page.getByText("提醒时间与免打扰", { exact: true }).click();
  const content = page.getByTestId("page-scroll");
  await expect(content).toHaveCSS("scrollbar-width", "none");
  await content.evaluate((el) => (el.scrollTop = 0));
  const box = await content.boundingBox();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + 100);
  await page.mouse.wheel(0, 400);
  await expect
    .poll(() => content.evaluate((el) => el.scrollTop))
    .toBeGreaterThan(100);
  expect(await page.evaluate(() => scrollY)).toBe(0);
});
