import { test, expect } from "@playwright/test";
import { fillField } from "./edit-fields";

test("E01: a busy visitor can do one thing without setup or a follow-up questionnaire", async ({
  page,
}) => {
  await page.goto("./");
  await page.getByLabel("添加今天的行动").fill("出门走一小圈");
  await page.getByLabel("添加今天的行动").press("Enter");
  await page
    .getByRole("checkbox", { name: "出门走一小圈", exact: true })
    .check();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "今天，什么行动有帮助？", exact: true }),
  ).toBeHidden();
  await expect(
    page.getByRole("button", { name: "撤销完成", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "主导航" }).getByRole("button"),
  ).toHaveCount(3);
});

test("E02: returning after a week creates no backlog and keeps the old record", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-11-02T10:00:00+09:00"));
  await page.goto("./");
  await page.getByLabel("添加今天的行动").fill("上次没有做完的一小步");
  await page.getByRole("button", { name: "添加", exact: true }).click();
  await fillField(page, "明天，准备做什么小调整？", "不用重抄的旧调整");
  await expect(page.locator("button.sync")).toContainText("本机已保存");
  await page.clock.setFixedTime(new Date("2026-11-10T10:00:00+09:00"));
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "今天", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await expect(
    page.getByText("接着昨天，也可以重新选", { exact: true }),
  ).toHaveCount(0);
  await expect(page.getByText(/逾期|欠账|补填|断签/)).toHaveCount(0);
  await page.getByRole("button", { name: "回顾", exact: true }).click();
  await expect(
    page.getByText("○ 上次没有做完的一小步", { exact: true }),
  ).toBeVisible();
  await page.getByText("从这天继续（可选）", { exact: true }).click();
  await page
    .getByRole("button", { name: "继续：上次没有做完的一小步", exact: true })
    .click();
  await page
    .getByRole("button", { name: "继续：不用重抄的旧调整", exact: true })
    .click();
  await page.getByRole("button", { name: "今天", exact: true }).click();
  await expect(
    page.getByRole("checkbox", { name: "上次没有做完的一小步", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("checkbox", { name: "不用重抄的旧调整", exact: true }),
  ).toBeVisible();
});

test("E03: an action editor closes by keyboard, keeps its edit and restores focus", async ({
  page,
}) => {
  await page.goto("./");
  await page.getByLabel("添加今天的行动").fill("先写两分钟");
  await page.getByRole("button", { name: "添加", exact: true }).click();
  await page
    .getByRole("button", { name: "修改行动：先写两分钟", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "修改行动", exact: true })
    .getByRole("textbox")
    .fill("写一句也可以");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("checkbox", { name: "写一句也可以", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "修改行动：写一句也可以", exact: true }),
  ).toBeFocused();
});

test("E04: optional writing works on a small screen and changing questions remains reversible", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("./?view=reflect");
  await page.getByText("记一句，或调整下一步", { exact: true }).click();
  const input = page.getByRole("textbox", {
    name: "此刻，我注意到……",
    exact: true,
  });
  await expect(input).toBeVisible();
  expect((await input.boundingBox())!.height).toBeGreaterThanOrEqual(80);
  await input.fill("有一个想法，先放在这里");
  await page.getByRole("button", { name: "选择一个问题", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "选择一个问题", exact: true }),
  ).toBeFocused();
  await expect(input).toHaveValue("有一个想法，先放在这里");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
});

test("E05: clearing and rewriting this week's note never overwrites another legacy entry", async ({
  page,
}) => {
  const { emptyState } = await import("../../src/domain");
  const { createBackup } = await import("../../src/backup");
  await page.clock.setFixedTime(new Date("2026-11-04T10:00:00+09:00"));
  await page.goto("./?view=settings");
  const state = emptyState();
  state.weekly = {
    "2026-11-02": "周一保留的观察",
    "2026-11-03": "周二准备重写的观察",
  };
  await page.getByLabel("选择备份文件（先预览，不会立即修改）").setInputFiles({
    name: "fictional-week.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(await createBackup(state))),
  });
  await page
    .getByRole("button", { name: "用备份替换当前内容", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "确认继续", exact: true })
    .click();
  await page.getByRole("button", { name: "回顾", exact: true }).click();
  await page.getByText("本周，想调整什么", { exact: true }).click();
  await page
    .getByRole("button", { name: "写下本周的观察", exact: true })
    .click();
  const editor = page.getByRole("dialog").getByRole("textbox");
  await editor.fill("");
  await editor.fill("重写周二，不动周一");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "完成", exact: true })
    .click();
  await expect(page.getByText("周一保留的观察", { exact: true })).toBeVisible();
  await expect(
    page
      .getByRole("heading", { name: "2026-11-03 · 周回顾", exact: true })
      .locator("..")
      .getByText("重写周二，不动周一", { exact: true }),
  ).toBeVisible();
});

test("E06: editing an action through midnight writes to its original day", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-11-02T23:59:00+09:00") });
  await page.goto("./");
  await page.getByLabel("添加今天的行动").fill("跨日前的行动");
  await page.getByRole("button", { name: "添加", exact: true }).click();
  await page
    .getByRole("button", { name: "修改行动：跨日前的行动", exact: true })
    .click();
  await page.getByRole("dialog").getByRole("textbox").fill("跨日前改到一半");
  await page.clock.fastForward(120000);
  await page
    .getByRole("dialog")
    .getByRole("textbox")
    .fill("跨日后也应保留的修改");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "完成", exact: true })
    .click();
  await page.getByRole("button", { name: "回顾", exact: true }).click();
  await expect(
    page.getByText("○ 跨日后也应保留的修改", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("○ 跨日前的行动", { exact: true })).toHaveCount(
    0,
  );
});

test("E07: browser Back does not discard an action editor's non-empty changes", async ({
  page,
}) => {
  await page.goto("./?view=direction");
  await page.getByRole("button", { name: "今天", exact: true }).click();
  await page.getByLabel("添加今天的行动").fill("原来的行动");
  await page.getByRole("button", { name: "添加", exact: true }).click();
  await page
    .getByRole("button", { name: "修改行动：原来的行动", exact: true })
    .click();
  await page.getByRole("dialog").getByRole("textbox").fill("已经改小的一步");
  await page.goBack();
  await expect(
    page.getByRole("heading", { name: "方向", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "今天", exact: true }).click();
  await expect(
    page.getByRole("checkbox", { name: "已经改小的一步", exact: true }),
  ).toBeVisible();
});

test("E08: a weekly editor keeps its original note when Sunday becomes Monday", async ({
  page,
}) => {
  const { emptyState } = await import("../../src/domain");
  const { createBackup } = await import("../../src/backup");
  await page.clock.install({ time: new Date("2026-11-08T23:59:00+09:00") });
  await page.goto("./?view=settings");
  const state = emptyState();
  state.weekly = { "2026-11-08": "周日写到一半的观察" };
  await page.getByLabel("选择备份文件（先预览，不会立即修改）").setInputFiles({
    name: "fictional-sunday.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(await createBackup(state))),
  });
  await page
    .getByRole("button", { name: "用备份替换当前内容", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "确认继续", exact: true })
    .click();
  await page.getByRole("button", { name: "回顾", exact: true }).click();
  await page.getByText("本周，想调整什么", { exact: true }).click();
  await page
    .getByRole("button", { name: "写下本周的观察", exact: true })
    .click();
  await page.clock.fastForward(120000);
  const editor = page.getByRole("dialog").getByRole("textbox");
  await expect(editor).toHaveValue("周日写到一半的观察");
  await editor.fill("仍然属于上周的完整观察");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "完成", exact: true })
    .click();
  await expect(
    page
      .getByRole("heading", { name: "2026-11-08 · 周回顾", exact: true })
      .locator("..")
      .getByText("仍然属于上周的完整观察", { exact: true }),
  ).toBeVisible();
});

test("E09: a daily review editor stays on the day it was opened", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-11-02T23:59:00+09:00") });
  await page.goto("./");
  await page.getByText("留一句给明天", { exact: true }).click();
  await page
    .getByRole("button", { name: "明天，准备做什么小调整？", exact: true })
    .click();
  const editor = page.getByRole("dialog").getByRole("textbox");
  await editor.fill("周一晚上开始写的调整");
  await page.clock.fastForward(120000);
  await expect(editor).toHaveValue("周一晚上开始写的调整");
  await editor.fill("写完后仍属于周一的调整");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "完成", exact: true })
    .click();
  await page.getByRole("button", { name: "回顾", exact: true }).click();
  await expect(
    page
      .getByRole("heading", { name: "2026-11-02", exact: true })
      .locator("..")
      .getByText("明天调整：写完后仍属于周一的调整", { exact: true }),
  ).toBeVisible();
});

test("E10: clearing an action character by character keeps the opening original", async ({
  page,
}) => {
  await page.goto("./");
  await page.getByLabel("添加今天的行动").fill("写三个句子");
  await page.getByRole("button", { name: "添加", exact: true }).click();
  await page
    .getByRole("button", { name: "修改行动：写三个句子", exact: true })
    .click();
  const editor = page.getByRole("dialog").getByRole("textbox");
  await editor.press("End");
  for (let index = 0; index < 5; index++) await editor.press("Backspace");
  await expect(editor).toHaveValue("");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "完成", exact: true })
    .click();
  await expect(
    page.getByRole("checkbox", { name: "写三个句子", exact: true }),
  ).toBeVisible();
});
