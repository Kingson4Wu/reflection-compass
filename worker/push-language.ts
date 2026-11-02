import { normalizeLanguage, questionText } from "../src/language";

export function testPushMessage(locale: unknown) {
  const lang = normalizeLanguage(locale);
  return {
    title:
      lang === "en"
        ? "Reflection Compass · Test reminder"
        : "Reflection Compass · 测试提醒",
    body:
      lang === "en"
        ? "A test reminder from Reflection Compass."
        : "推送链路已接受请求，打开应用开始一次反思。",
    url: "?view=reflect",
    lang,
  };
}
export function scheduledPushMessage(
  locale: unknown,
  task: { id: string; day: string; question: string },
) {
  const lang = normalizeLanguage(locale);
  return {
    title: lang === "en" ? "Take a moment for yourself" : "给自己一次停顿",
    body:
      lang === "en"
        ? "Are your actions taking you toward where you want to go?"
        : "看看此刻的行动，是否靠近你想去的方向。",
    url: `?view=reflect&day=${task.day}&question=${encodeURIComponent(questionText(task.question, lang))}`,
    tag: task.id,
    lang,
  };
}
