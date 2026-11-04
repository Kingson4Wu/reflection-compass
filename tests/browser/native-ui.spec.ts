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

// Use a real drag: selecting a Range from JavaScript bypasses user-select rules.
async function dragText(
  page: import("@playwright/test").Page,
  target: import("@playwright/test").Locator,
) {
  await target.scrollIntoViewIfNeeded();
  const rect = await target.evaluate((el) => {
    window.getSelection()?.removeAllRanges();
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let text: Node | null;
    while ((text = walker.nextNode())) {
      if (!text.textContent?.trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(text);
      const box = range.getClientRects()[0];
      if (box?.width && box.height)
        return { x: box.x, y: box.y, width: box.width, height: box.height };
    }
    throw new Error("No visible text to drag");
  });
  await page.mouse.move(rect.x + 1, rect.y + rect.height / 2);
  await page.mouse.down();
  await page.mouse.move(rect.x + rect.width - 1, rect.y + rect.height / 2, {
    steps: 12,
  });
  await page.mouse.up();
  return page.evaluate(() => window.getSelection()?.toString() ?? "");
}

test("app controls do not select text when dragged, including sheet and question-picker labels", async ({
  page,
}) => {
  await page.goto("./?view=direction");
  expect(
    await dragText(
      page,
      page.getByRole("heading", { name: "方向", exact: true }),
    ),
  ).toBe("");
  expect(
    await dragText(
      page,
      page.getByRole("button", { name: "方向", exact: true }),
    ),
  ).toBe("");
  expect(await dragText(page, page.locator(".row-label").first())).toBe("");
  const dialog = page.getByRole("dialog", {
    name: "我想过怎样的生活",
    exact: true,
  });
  if (!(await dialog.isVisible()))
    await page
      .getByRole("button", { name: "我想过怎样的生活", exact: true })
      .click();
  expect(await dragText(page, dialog.getByRole("heading"))).toBe("");
  await dialog.getByRole("button", { name: "完成", exact: true }).click();
  await page.getByRole("button", { name: "停顿", exact: true }).click();
  await page.getByRole("button", { name: "选择一个问题", exact: true }).click();
  expect(
    await dragText(page, page.locator(".question-options button span").first()),
  ).toBe("");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "设置", exact: true }).click();
  expect(
    await dragText(page, page.getByText("通知诊断", { exact: true })),
  ).toBe("");
  expect(
    await dragText(page, page.getByText("连接后记住此设备", { exact: true })),
  ).toBe("");
});

test("personal writing stays selectable in action lists, editors and saved reviews", async ({
  page,
}) => {
  await page.goto("./");
  await page.getByLabel("添加今天的行动").fill("写下一段可以复制的个人行动");
  await page.getByRole("button", { name: "添加", exact: true }).click();
  const action = page.locator(".action-list label span").first();
  expect((await dragText(page, action)).length).toBeGreaterThan(3);
  await expect(
    page.getByRole("checkbox", {
      name: "写下一段可以复制的个人行动",
      exact: true,
    }),
  ).not.toBeChecked();
  await page.evaluate(() => window.getSelection()?.removeAllRanges());
  await action.click();
  await expect(
    page.getByRole("checkbox", {
      name: "写下一段可以复制的个人行动",
      exact: true,
    }),
  ).toBeChecked();
  await page.getByRole("button", { name: "方向", exact: true }).click();
  await page
    .getByRole("button", { name: "我想过怎样的生活", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "我想过怎样的生活",
    exact: true,
  });
  const editor = dialog.getByRole("textbox");
  const writing = "编辑器仍然可以全选、复制和修改";
  await editor.fill(writing);
  await editor.press("ControlOrMeta+A");
  expect(
    await editor.evaluate(
      (el) =>
        (el as HTMLTextAreaElement).selectionEnd -
        (el as HTMLTextAreaElement).selectionStart,
    ),
  ).toBe(writing.length);
  await editor.press("ArrowRight");
  await editor.press("End");
  await dialog.getByRole("button", { name: "完成", exact: true }).click();
  await page.getByRole("button", { name: "停顿", exact: true }).click();
  await page.getByText("记一句，或调整下一步", { exact: true }).click();
  await page
    .getByLabel("此刻，我注意到……")
    .fill("这是一段需要保留复制能力的个人观察");
  await page.getByRole("button", { name: "记录这次停顿", exact: true }).click();
  await page.getByRole("button", { name: "回顾", exact: true }).click();
  const review = page.getByText("这是一段需要保留复制能力的个人观察", {
    exact: true,
  });
  expect((await dragText(page, review)).length).toBeGreaterThan(3);
});
