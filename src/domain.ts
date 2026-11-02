import { z } from "zod";
const text = z.string().max(10000);
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (v) =>
      !Number.isNaN(Date.parse(v)) &&
      new Date(v).toISOString().slice(0, 10) === v,
  );
export const QUESTIONS = [
  "我正在走向自己想要的生活吗？",
  "我现在做的事，可能在帮助我逃避什么？",
  "接下来能做的最小一步是什么？",
  "今天什么时候，我最有生命力？",
];
export const stateSchema = z.object({
  direction: z.object({
    vision: text,
    antiVision: text,
    identity: text,
    goal: text,
    project: text,
    constraints: text,
  }),
  days: z.record(
    day,
    z.object({
      actions: z
        .array(
          z.object({
            id: z.string().max(100),
            text: z.string().trim().min(1).max(300),
            done: z.boolean(),
          }),
        )
        .max(3),
      reflections: z
        .array(
          z.object({
            id: z.string().max(100),
            at: z.string().datetime(),
            question: text,
            answer: text,
            next: text,
            skipped: z.boolean(),
          }),
        )
        .max(100),
      evening: z.object({ worked: text, obstacle: text, next: text }),
    }),
  ),
  weekly: z.record(day, text),
  settings: z.object({
    timezone: z.string().refine((v) => {
      try {
        new Intl.DateTimeFormat("en", { timeZone: v });
        return true;
      } catch {
        return false;
      }
    }),
    slots: z
      .array(time)
      .max(6)
      .refine((v) => new Set(v).size === v.length),
    quietStart: time,
    quietEnd: time,
    paused: z.boolean(),
  }),
});
export type State = z.infer<typeof stateSchema>;
export type Day = State["days"][string];
export function emptyState(): State {
  return {
    direction: {
      vision: "",
      antiVision: "",
      identity: "",
      goal: "",
      project: "",
      constraints: "",
    },
    days: {},
    weekly: {},
    settings: {
      timezone: "Asia/Tokyo",
      slots: ["11:00", "15:15", "19:30"],
      quietStart: "22:00",
      quietEnd: "08:00",
      paused: true,
    },
  };
}
export function emptyDay(): Day {
  return {
    actions: [],
    reflections: [],
    evening: { worked: "", obstacle: "", next: "" },
  };
}
export function localDay(date: Date, timezone: string) {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  return ["year", "month", "day"]
    .map((k) => p.find((x) => x.type === k)!.value)
    .join("-");
}
export function isQuiet(now: string, start: string, end: string) {
  return start === end
    ? false
    : start < end
      ? now >= start && now < end
      : now >= start || now < end;
}
export function dueSlots(state: State, date: Date) {
  if (state.settings.paused) return [];
  const p = new Intl.DateTimeFormat("en-GB", {
    timeZone: state.settings.timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
  if (isQuiet(p, state.settings.quietStart, state.settings.quietEnd)) return [];
  const minutes = (t: string) =>
    Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
  const day = localDay(date, state.settings.timezone);
  return state.settings.slots.flatMap((slot, i) => {
    const diff = minutes(p) - minutes(slot);
    return diff >= 0 && diff < 5
      ? [
          {
            id: `${day}:${slot}`,
            day,
            question: QUESTIONS[i % QUESTIONS.length],
          },
        ]
      : [];
  });
}
