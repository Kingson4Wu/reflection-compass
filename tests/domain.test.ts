import { describe, it, expect } from "vitest";
import {
  stateSchema,
  emptyState,
  localDay,
  isQuiet,
  dueSlots,
  QUESTIONS,
} from "../src/domain";
describe("personal reflection rules", () => {
  it("starts with no manufactured personal data", () => {
    expect(emptyState().days).toEqual({});
    expect(emptyState().direction.vision).toBe("");
  });
  it("limits daily levers to three", () => {
    const s = emptyState();
    s.days["2026-11-02"] = {
      actions: Array.from({ length: 4 }, (_, i) => ({
        id: String(i),
        text: "行动",
        done: false,
      })),
      reflections: [],
      evening: { worked: "", obstacle: "", next: "" },
    };
    expect(stateSchema.safeParse(s).success).toBe(false);
  });
  it("rejects malformed calendar dates", () => {
    const s = emptyState();
    s.days["2026-99-99"] = {
      actions: [],
      reflections: [],
      evening: { worked: "", obstacle: "", next: "" },
    };
    expect(stateSchema.safeParse(s).success).toBe(false);
  });
  it("uses Tokyo date across UTC midnight", () =>
    expect(localDay(new Date("2026-11-01T16:00:00Z"), "Asia/Tokyo")).toBe(
      "2026-11-02",
    ));
  it("handles quiet hours crossing midnight", () => {
    expect(isQuiet("23:00", "22:00", "08:00")).toBe(true);
    expect(isQuiet("07:59", "22:00", "08:00")).toBe(true);
    expect(isQuiet("12:00", "22:00", "08:00")).toBe(false);
  });
  it("only schedules a slot once in its five minute window", () => {
    const s = emptyState();
    s.settings.paused = false;
    s.settings.slots = ["11:00"];
    expect(dueSlots(s, new Date("2026-11-02T02:02:00Z"))).toEqual([
      { id: "2026-11-02:11:00", day: "2026-11-02", question: QUESTIONS[0] },
    ]);
    expect(dueSlots(s, new Date("2026-11-02T02:06:00Z"))).toEqual([]);
  });
  it("suppresses paused and quiet time slots", () => {
    const s = emptyState();
    s.settings.slots = ["23:00"];
    s.settings.paused = false;
    expect(dueSlots(s, new Date("2026-11-02T14:00:00Z"))).toEqual([]);
    s.settings.slots = ["11:00"];
    s.settings.paused = true;
    expect(dueSlots(s, new Date("2026-11-02T02:00:00Z"))).toEqual([]);
  });
  it("rejects invalid timezones and duplicated slots", () => {
    const s = emptyState();
    s.settings.timezone = "fake";
    expect(stateSchema.safeParse(s).success).toBe(false);
    s.settings.timezone = "Asia/Tokyo";
    s.settings.slots = ["11:00", "11:00"];
    expect(stateSchema.safeParse(s).success).toBe(false);
  });
});
