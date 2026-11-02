import { it, expect } from "vitest";
import {
  fresh,
  queueChange,
  applyReply,
  bootstrapSnapshot,
  resolveRecord,
} from "../src/sync-model";
import { emptyState } from "../src/domain";
it("compacts unsent typing but appends after a sent operation", () => {
  let s = fresh();
  let state = structuredClone(s.state);
  state.direction.vision = "a";
  s = queueChange(s, state);
  state = structuredClone(state);
  state.direction.vision = "ab";
  s = queueChange(s, state);
  expect(s.operations).toHaveLength(1);
  s.operations![0].sent = true;
  state = structuredClone(state);
  state.direction.vision = "abc";
  s = queueChange(s, state);
  expect(s.operations).toHaveLength(2);
  expect(s.operations![1].base).toBe("ab");
});
it("preserves edits made while a cloud request is in flight", () => {
  let s = fresh();
  let state = structuredClone(s.state);
  state.direction.vision = "first";
  s = queueChange(s, state);
  const first = s.operations![0];
  first.sent = true;
  state = structuredClone(state);
  state.direction.vision = "second";
  s = queueChange(s, state);
  const cloud = emptyState();
  cloud.direction.vision = "first";
  const next = applyReply(s, {
    state: cloud,
    revision: 1,
    results: [{ id: first.id, key: first.key, status: "applied" }],
  });
  expect(next.state.direction.vision).toBe("second");
  expect(next.operations).toHaveLength(1);
});
it("keeps both conflicting drafts and queues an explicit resolution", () => {
  let s = fresh();
  const state = structuredClone(s.state);
  state.direction.vision = "phone";
  s = queueChange(s, state);
  const op = s.operations![0];
  const cloud = emptyState();
  cloud.direction.vision = "mac";
  s = applyReply(s, {
    state: cloud,
    revision: 1,
    results: [
      {
        id: op.id,
        key: op.key,
        status: "conflict",
        conflict: {
          id: op.id,
          key: op.key,
          base: "",
          local: "phone",
          remote: "mac",
          reason: "conflict",
        },
      },
    ],
  });
  expect(s.conflicts).toHaveLength(1);
  expect(s.state.direction.vision).toBe("phone");
  s = resolveRecord(s, op.key, "local");
  expect(s.conflicts).toHaveLength(0);
  expect(s.operations![0]).toMatchObject({ base: "mac", value: "phone" });
});
it("migrates a stale legacy draft to explicit conflicts rather than guessing", () => {
  const local = emptyState(),
    remote = emptyState();
  local.direction.vision = "phone";
  remote.direction.vision = "mac";
  const s = bootstrapSnapshot(
    {
      state: local,
      revision: 1,
      dirty: true,
      updatedAt: new Date().toISOString(),
    },
    { state: remote, revision: 2 },
  );
  expect(s.operations).toEqual([]);
  expect(
    s.conflicts?.some((c) => c.local === "phone" && c.remote === "mac"),
  ).toBe(true);
});
