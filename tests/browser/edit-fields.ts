import { expect, type Page } from "@playwright/test";
async function revealField(page: Page, label: string) {
  const row = page.getByRole("button", { name: label, exact: true });
  if (await row.isVisible()) return;
  if (
    [
      "明天，准备做什么小调整？",
      "今天，什么行动有帮助？",
      "什么让行动变得困难？",
    ].includes(label)
  ) {
    const review = page.locator("details.daily-review");
    if (!(await review.evaluate((el) => (el as HTMLDetailsElement).open)))
      await page.getByText("留一句给明天", { exact: true }).click();
    if (label !== "明天，准备做什么小调整？" && !(await row.isVisible()))
      await page.getByText("也想记下今天的观察", { exact: true }).click();
  }
  if (label === "写下本周的观察")
    await page.getByText("本周，想调整什么", { exact: true }).click();
}
export async function fillField(page: Page, label: string, value: string) {
  await revealField(page, label);
  await page.getByRole("button", { name: label, exact: true }).click();
  const editor = page.getByRole("dialog", { name: label, exact: true });
  await editor.getByRole("textbox", { name: label, exact: true }).fill(value);
  await editor.getByRole("button", { name: "完成", exact: true }).click();
}
export async function expectField(page: Page, label: string, value: string) {
  await revealField(page, label);
  await page.getByRole("button", { name: label, exact: true }).click();
  const editor = page.getByRole("dialog", { name: label, exact: true });
  await expect(
    editor.getByRole("textbox", { name: label, exact: true }),
  ).toHaveValue(value);
  await editor.getByRole("button", { name: "完成", exact: true }).click();
}
