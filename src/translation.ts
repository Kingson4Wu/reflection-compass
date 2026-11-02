import { en } from "./messages";
import type { Language } from "./language";

const reverse = new Map(Object.entries(en).map(([key, value]) => [value, key]));
const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function compile(template: string) {
  const indexes: number[] = [];
  let position = 0,
    expression = "^";
  for (const match of template.matchAll(/\{(\d+)\}/g)) {
    expression +=
      escape(template.slice(position, match.index)) + "([\\s\\S]*?)";
    indexes.push(Number(match[1]));
    position = match.index! + match[0].length;
  }
  return {
    expression: new RegExp(expression + escape(template.slice(position)) + "$"),
    indexes,
  };
}
const patterns = Object.entries(en)
  .filter(([source]) => /\{\d+\}/.test(source))
  .map(([source, english]) => ({
    source,
    english,
    zh: compile(source),
    en: compile(english),
  }));

/** Only call for system copy. Personal text is rendered directly. */
export function translate(input: string, language: Language): string {
  if (Object.hasOwn(en, input)) return language === "en" ? en[input] : input;
  const source = reverse.get(input);
  if (source !== undefined) return language === "zh-CN" ? source : input;
  for (const pattern of patterns) {
    const from = language === "en" ? pattern.zh : pattern.en;
    const match = from.expression.exec(input);
    if (!match) continue;
    const values = new Map(
      from.indexes.map((index, group) => [index, match[group + 1]]),
    );
    return (language === "en" ? pattern.english : pattern.source).replace(
      /\{(\d+)\}/g,
      (_, index) => values.get(Number(index)) ?? "",
    );
  }
  return input;
}
