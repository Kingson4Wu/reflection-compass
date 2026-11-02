import { emptyDay, type Day, type State } from "./domain";

export type Adoption = "added" | "exists" | "empty" | "too-long" | "full";
export function adoptAction(day: Day, id: string, input: string): Adoption {
  const text = input.trim();
  if (!text) return "empty";
  if (text.length > 300) return "too-long";
  if (day.actions.some((a) => a.id === id || a.text === text)) return "exists";
  if (day.actions.length >= 3) return "full";
  day.actions.push({ id, text, done: false });
  return "added";
}
export const adoptionMessage = (result: Adoption) =>
  ({
    added: "已放入今天的行动。",
    exists: "这一步已经在今天了。",
    empty: "写下一件具体的小事即可。",
    "too-long": "行动请缩短到 300 字以内，原记录不会改变。",
    full: "今天已选三项。可回到今天直接修改；若要新增，请先移除一项。",
  })[result];

export function previousDay(today: string) {
  const date = new Date(today + "T12:00:00Z");
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}
export function continuation(
  state: State,
  today: string,
  date = previousDay(today),
) {
  const yesterday = state.days[date];
  if (!yesterday) return [];
  const current = state.days[today] ?? emptyDay();
  const seen = new Set(current.actions.map((a) => a.text));
  return [
    ...yesterday.actions
      .filter((a) => !a.done)
      .map(({ id, text }) => ({ id, text })),
    { id: "evening:" + date, text: yesterday.evening.next.trim() },
  ].filter(({ id, text }) => {
    if (!text || seen.has(text) || current.actions.some((a) => a.id === id))
      return false;
    seen.add(text);
    return true;
  });
}
export function weekNote(notes: State["weekly"], today: string) {
  const date = new Date(today + "T12:00:00Z");
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  const start = date.toISOString().slice(0, 10);
  const key =
    Object.keys(notes)
      .filter((day) => day >= start && day <= today)
      .sort()
      .at(-1) ?? start;
  return { key, value: notes[key] ?? "" };
}
