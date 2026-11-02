import { test, expect } from "@playwright/test";
import { fillField } from "./edit-fields";

test("a pause needs no writing and leaving it creates no homework record", async ({
  page,
}) => {
  await page.goto("./?view=reflect");
  await expect(
    page.getByRole("heading", { name: "停顿", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("textbox")).toHaveCount(0);
  await page.getByRole("button", { name: "回到今天", exact: true }).click();
  await page.getByRole("button", { name: "回顾", exact: true }).click();
  await expect(page.getByText("本次跳过", { exact: true })).toHaveCount(0);
  await expect(
    page.getByText("记录还没开始。", { exact: false }),
  ).toBeVisible();
});

test("a next step becomes an action once and daily review stays optional", async ({
  page,
}) => {
  await page.goto("./");
  await expect(
    page.getByRole("button", { name: "今天，什么行动有帮助？", exact: true }),
  ).toBeHidden();
  await page.getByRole("button", { name: "停顿", exact: true }).click();
  await page.getByText("记一句，或调整下一步", { exact: true }).click();
  await page.getByLabel("如果再次遇到这个情境，我就……").fill("先写三个句子");
  await page
    .getByRole("button", { name: "采用为今天的行动", exact: true })
    .click();
  await expect(
    page.getByRole("checkbox", { name: "先写三个句子", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /同步状态/ })).toContainText(
    "本机已保存",
  );
  await page.reload();
  await expect(
    page.getByRole("checkbox", { name: "先写三个句子", exact: true }),
  ).toHaveCount(1);
  await page
    .getByRole("checkbox", { name: "先写三个句子", exact: true })
    .check();
  await expect(page.getByRole("textbox")).toHaveCount(1);
  await page.getByRole("button", { name: "撤销完成", exact: true }).click();
  await expect(
    page.getByRole("checkbox", { name: "先写三个句子", exact: true }),
  ).not.toBeChecked();
  await page
    .getByRole("button", { name: "修改行动：先写三个句子", exact: true })
    .click();
  const editor = page.getByRole("dialog", { name: "修改行动", exact: true });
  await editor.getByRole("textbox").fill("只写一句也可以");
  await editor.getByRole("button", { name: "完成", exact: true }).click();
  await expect(
    page.getByRole("checkbox", { name: "只写一句也可以", exact: true }),
  ).toBeVisible();
});

test("full lists retain the reflection and its next step for later", async ({
  page,
}) => {
  await page.goto("./");
  for (const text of ["一", "二", "三"]) {
    await page.getByLabel("添加今天的行动").fill(text);
    await page.getByRole("button", { name: "添加", exact: true }).click();
  }
  await page.getByRole("button", { name: "停顿", exact: true }).click();
  await page.getByText("记一句，或调整下一步", { exact: true }).click();
  await page.getByLabel("如果再次遇到这个情境，我就……").fill("下一次先散步");
  await page
    .getByRole("button", { name: "采用为今天的行动", exact: true })
    .click();
  await expect(
    page.getByText(
      "今天已选三项。可回到今天直接修改；若要新增，请先移除一项。",
      {
        exact: true,
      },
    ),
  ).toBeVisible();
  await expect(page.getByLabel("如果再次遇到这个情境，我就……")).toHaveValue(
    "下一次先散步",
  );
  await page.getByRole("button", { name: "记录这次停顿", exact: true }).click();
  await page.getByRole("button", { name: "回顾", exact: true }).click();
  await expect(
    page.getByText("下一步：下一次先散步", { exact: true }),
  ).toBeVisible();
});

test("navigation keeps unfinished inputs and long next steps are never truncated", async ({
  page,
}) => {
  await page.goto("./");
  await page.getByLabel("添加今天的行动").fill("还没写完的行动");
  await page.getByRole("button", { name: "方向", exact: true }).click();
  await page.getByRole("button", { name: "今天", exact: true }).click();
  await expect(page.getByLabel("添加今天的行动")).toHaveValue("还没写完的行动");
  await page.getByRole("button", { name: "停顿", exact: true }).click();
  await page.getByText("记一句，或调整下一步", { exact: true }).click();
  const text = "长".repeat(301);
  await page.getByLabel("如果再次遇到这个情境，我就……").fill(text);
  await page
    .getByRole("button", { name: "采用为今天的行动", exact: true })
    .click();
  await expect(
    page.getByText("行动请缩短到 300 字以内，原记录不会改变。", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByLabel("如果再次遇到这个情境，我就……")).toHaveValue(
    text,
  );
  await page.getByRole("button", { name: "今天", exact: true }).click();
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await page.getByRole("button", { name: "停顿", exact: true }).click();
  await expect(page.getByLabel("如果再次遇到这个情境，我就……")).toHaveValue(
    text,
  );
});

test("a saved observation can be adopted from history without duplicate actions", async ({
  page,
}) => {
  await page.goto("./?view=reflect");
  await page.getByText("记一句，或调整下一步", { exact: true }).click();
  await page.getByLabel("如果再次遇到这个情境，我就……").fill("先写两分钟");
  await page.getByRole("button", { name: "记录这次停顿", exact: true }).click();
  await page.getByRole("button", { name: "回顾", exact: true }).click();
  await page
    .getByRole("button", { name: "用作今天的行动", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "已在今天", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "今天", exact: true }).click();
  await expect(
    page.getByRole("checkbox", { name: "先写两分钟", exact: true }),
  ).toHaveCount(1);
});

test("yesterday is an optional continuation and weekly writing survives the next day", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-11-02T10:00:00+09:00"));
  await page.goto("./");
  await page.getByLabel("添加今天的行动").fill("写三个句子");
  await page.getByRole("button", { name: "添加", exact: true }).click();
  await page.getByText("留一句给明天", { exact: true }).click();
  await fillField(page, "明天，准备做什么小调整？", "午饭后先写两分钟");
  await page.getByRole("button", { name: "回顾", exact: true }).click();
  await page.getByText("本周，想调整什么", { exact: true }).click();
  await fillField(page, "写下本周的观察", "先写再找资料");
  await expect(page.getByRole("button", { name: /同步状态/ })).toContainText(
    "本机已保存",
  );
  await page.clock.setFixedTime(new Date("2026-11-03T10:00:00+09:00"));
  await page.reload();
  await page.getByRole("button", { name: "今天", exact: true }).click();
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await page.getByText("接着昨天，也可以重新选", { exact: true }).click();
  await page
    .getByRole("button", { name: "继续：写三个句子", exact: true })
    .click();
  await expect(
    page.getByRole("checkbox", { name: "写三个句子", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /同步状态/ })).toContainText(
    "本机已保存",
  );
  await page.reload();
  await expect(
    page.getByRole("checkbox", { name: "写三个句子", exact: true }),
  ).toHaveCount(1);
  await page.getByRole("button", { name: "回顾", exact: true }).click();
  await page.getByText("本周，想调整什么", { exact: true }).click();
  await expect(
    page.getByRole("button", { name: "写下本周的观察", exact: true }),
  ).toContainText("先写再找资料");
});
