import { expect, it } from "vitest";
import {
  normalizeLanguage,
  localizedQuestions,
  questionText,
} from "../src/language";
import { translate } from "../src/translation";

it("keeps Chinese as the default and localizes only recognized built-in questions", () => {
  expect(normalizeLanguage(undefined)).toBe("zh-CN");
  expect(normalizeLanguage("fr")).toBe("zh-CN");
  expect(normalizeLanguage("en")).toBe("en");
  const chinese = localizedQuestions("zh-CN");
  const english = localizedQuestions("en");
  expect(english).toHaveLength(chinese.length);
  expect(questionText(chinese[0], "en")).toBe(english[0]);
  expect(questionText(english[0], "zh-CN")).toBe(chinese[0]);
  expect(questionText("我自己的问题，不应被替换", "en")).toBe(
    "我自己的问题，不应被替换",
  );
});

it("translates known system messages and dynamic values without translating their content", () => {
  expect(translate("今天", "en")).toBe("Today");
  expect(translate("Today", "zh-CN")).toBe("今天");
  const message = translate(
    "移除“我的中文设备”的访问权限？本机历史副本不会被远程擦除。",
    "en",
  );
  expect(message).toContain("我的中文设备");
  expect(message).not.toContain("本机历史副本");
  expect(translate("My own unregistered text", "en")).toBe(
    "My own unregistered text",
  );
});
