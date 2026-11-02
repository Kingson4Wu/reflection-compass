import { describe, it, expect } from "vitest";
import { emptyState, emptyDay } from "../src/domain";
import { toRecords, fromRecords, changes, mergeValue } from "../src/records";
describe("record synchronization", () => {
  it("roundtrips existing data and action order", () => {
    const state = emptyState();
    state.days["2026-11-02"] = emptyDay();
    state.days["2026-11-02"].actions = [
      { id: "z", text: "first", done: false },
      { id: "a", text: "second", done: true },
    ];
    expect(fromRecords(toRecords(state))).toEqual(state);
  });
  it("emits only edited records, including deletion markers", () => {
    const base = emptyState();
    base.days["2026-11-02"] = emptyDay();
    base.days["2026-11-02"].actions = [{ id: "a", text: "one", done: false }];
    const local = structuredClone(base);
    local.direction.vision = "new";
    local.days["2026-11-02"].actions = [];
    expect(
      changes(base, local)
        .map((c) => c.key)
        .sort(),
    ).toEqual(["action:2026-11-02:a", "direction:vision"]);
    expect(
      changes(base, local).find((c) => c.key.startsWith("action"))?.value,
    ).toBeNull();
  });
  it("merges different fields on an action", () => {
    expect(
      mergeValue(
        { text: "a", done: false },
        { text: "b", done: false },
        { text: "a", done: true },
      ),
    ).toEqual({ ok: true, value: { text: "b", done: true } });
  });
  it("retains a same-field conflict rather than choosing a winner", () =>
    expect(mergeValue("base", "phone", "mac").ok).toBe(false));
  it("treats edit versus deletion as a conflict", () =>
    expect(mergeValue({ text: "base" }, { text: "changed" }, null).ok).toBe(
      false,
    ));
  it("does not resurrect an unchanged locally deleted record", () =>
    expect(mergeValue("old", "old", null)).toEqual({ ok: true, value: null }));
  it("rejects invalid record keys and invalid combined state", () => {
    expect(() => fromRecords({ "direction:__proto__": "bad" })).toThrow();
    const r = toRecords(emptyState());
    r["action:2026-11-02:a"] = { id: "a", text: "", done: false, order: 0 };
    expect(() => fromRecords(r)).toThrow();
  });
});
