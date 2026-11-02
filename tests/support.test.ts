import { describe, expect, it } from "vitest";
import { emptyDay, emptyState } from "../src/domain";
import {
  adoptAction,
  previousDay,
  continuation,
  weekNote,
} from "../src/support";

describe("explicit action adoption", () => {
  it("adds once and never silently truncates a reflection or replaces a full list", () => {
    const day = emptyDay();
    expect(adoptAction(day, "source", "  写三个句子  ")).toBe("added");
    expect(adoptAction(day, "source", "改过的文字")).toBe("exists");
    expect(adoptAction(day, "another", "写三个句子")).toBe("exists");
    expect(day.actions).toEqual([
      { id: "source", text: "写三个句子", done: false },
    ]);
    expect(adoptAction(day, "long", "字".repeat(301))).toBe("too-long");
    expect(adoptAction(day, "blank", " ")).toBe("empty");
    adoptAction(day, "two", "散步");
    adoptAction(day, "three", "读书");
    expect(adoptAction(day, "four", "休息")).toBe("full");
    expect(day.actions).toHaveLength(3);
  });
});

it("derives yesterday across month/year boundaries without timezone arithmetic", () => {
  expect(previousDay("2026-03-01")).toBe("2026-02-28");
  expect(previousDay("2028-03-01")).toBe("2028-02-29");
  expect(previousDay("2026-01-01")).toBe("2025-12-31");
});

it("offers only yesterday's unfinished choices and adjustment without changing history", () => {
  const state = emptyState();
  const yesterday = (state.days["2026-11-02"] = emptyDay());
  yesterday.actions = [
    { id: "one", text: "写三个句子", done: false },
    { id: "done", text: "已做过", done: true },
  ];
  yesterday.evening.next = "饭后散步";
  state.days["2026-10-01"] = {
    ...emptyDay(),
    actions: [{ id: "old", text: "旧任务", done: false }],
  };
  const before = JSON.stringify(state);
  expect(continuation(state, "2026-11-03").map((c) => c.text)).toEqual([
    "写三个句子",
    "饭后散步",
  ]);
  expect(JSON.stringify(state)).toBe(before);
  const today = (state.days["2026-11-03"] = emptyDay());
  adoptAction(today, "one", "写三个句子");
  expect(continuation(state, "2026-11-03").map((c) => c.text)).toEqual([
    "饭后散步",
  ]);
  expect(continuation(state, "2026-11-10")).toEqual([]);
});

it("uses a Monday week and edits the latest existing note without merging older text", () => {
  const notes = {
    "2026-11-01": "上周",
    "2026-11-02": "周一观察",
    "2026-11-03": "周二观察",
  };
  expect(weekNote(notes, "2026-11-04")).toEqual({
    key: "2026-11-03",
    value: "周二观察",
  });
  expect(weekNote(notes, "2026-11-08").key).toBe("2026-11-03");
  expect(weekNote(notes, "2026-11-09")).toEqual({
    key: "2026-11-09",
    value: "",
  });
  expect(notes["2026-11-02"]).toBe("周一观察");
  expect(weekNote({ ...notes, "2026-11-03": "" }, "2026-11-04")).toEqual({
    key: "2026-11-03",
    value: "",
  });
});
