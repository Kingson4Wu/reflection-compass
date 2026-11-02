import { emptyState, type State } from "./domain";
import {
  changes,
  toRecords,
  fromRecords,
  same,
  type PendingOperation,
  type RecordConflict,
  type SyncResponse,
  type Value,
} from "./records";
export interface Snapshot {
  state: State;
  revision: number;
  dirty: boolean;
  updatedAt: string;
  baseState?: State;
  operations?: PendingOperation[];
  conflicts?: RecordConflict[];
  lastSyncedAt?: string;
}
export function fresh(): Snapshot {
  return {
    state: emptyState(),
    baseState: emptyState(),
    revision: 0,
    dirty: false,
    updatedAt: new Date().toISOString(),
    operations: [],
    conflicts: [],
  };
}
export function queueChange(
  snapshot: Snapshot,
  state: State,
  revive = false,
): Snapshot {
  const operations = (snapshot.operations ?? []).map((operation) => ({
    ...operation,
  }));
  const conflicts = structuredClone(snapshot.conflicts ?? []);
  for (const change of changes(snapshot.state, state)) {
    const conflict = conflicts.find((c) => c.key === change.key);
    if (conflict) {
      conflict.local = change.value;
      continue;
    }
    const last = [...operations].reverse().find((op) => op.key === change.key);
    if (last && !last.sent) {
      last.value = change.value;
      if (revive) last.revive = true;
      if (same(last.base, last.value))
        operations.splice(operations.indexOf(last), 1);
    } else
      operations.push({
        id: crypto.randomUUID(),
        ...change,
        ...(revive ? { revive: true } : {}),
      });
  }
  return {
    ...snapshot,
    state,
    operations,
    conflicts,
    dirty: operations.length > 0 || conflicts.length > 0,
    updatedAt: new Date().toISOString(),
  };
}
export function bootstrapSnapshot(
  snapshot: Snapshot,
  remote: { state: State; revision: number },
): Snapshot {
  if (snapshot.baseState && snapshot.operations) return snapshot;
  if (!snapshot.dirty)
    return {
      ...snapshot,
      baseState: snapshot.state,
      operations: [],
      conflicts: [],
    };
  if (snapshot.revision === 0 || snapshot.revision === remote.revision) {
    const base = snapshot.revision === 0 ? emptyState() : remote.state;
    return queueChange(
      {
        ...snapshot,
        state: base,
        baseState: base,
        operations: [],
        conflicts: [],
      },
      snapshot.state,
    );
  }
  const local = toRecords(snapshot.state),
    cloud = toRecords(remote.state);
  const conflicts = [...new Set([...Object.keys(local), ...Object.keys(cloud)])]
    .filter((key) => !same(local[key] ?? null, cloud[key] ?? null))
    .map((key) => ({
      id: crypto.randomUUID(),
      key,
      base: null,
      local: local[key] ?? null,
      remote: cloud[key] ?? null,
      reason: "旧版本离线记录与云端不同，请确认要保留的内容。",
    }));
  return {
    ...snapshot,
    revision: remote.revision,
    baseState: remote.state,
    operations: [],
    conflicts,
  };
}
function visibleState(
  base: State,
  conflicts: RecordConflict[],
  operations: PendingOperation[],
): State {
  let state = base,
    records = toRecords(base);
  for (const change of [
    ...conflicts.map((c) => ({ key: c.key, value: c.local })),
    ...operations,
  ]) {
    try {
      const next = { ...records, [change.key]: change.value as Value };
      state = fromRecords(next);
      records = next;
    } catch {
      /* The conflict/outbox retains the draft even if it cannot yet fit the current daily limits. */
    }
  }
  return state;
}
export function applyReply(
  snapshot: Snapshot,
  response: SyncResponse,
): Snapshot {
  const acknowledged = new Set(response.results.map((result) => result.id));
  let operations = (snapshot.operations ?? []).filter(
    (op) => !acknowledged.has(op.id),
  );
  const conflicts = new Map(
    structuredClone(snapshot.conflicts ?? []).map((c) => [c.key, c]),
  );
  for (const result of response.results)
    if (result.status === "conflict") {
      const latest = [...operations]
        .reverse()
        .find((op) => op.key === result.key);
      conflicts.set(result.key, {
        ...result.conflict,
        local: (latest?.value ?? result.conflict.local) as Value,
      });
      operations = operations.filter((op) => op.key !== result.key);
    }
  const cloud = toRecords(response.state);
  for (const conflict of conflicts.values())
    conflict.remote = cloud[conflict.key] ?? null;
  const conflictList = [...conflicts.values()];
  return {
    ...snapshot,
    baseState: response.state,
    state: visibleState(response.state, conflictList, operations),
    revision: response.revision,
    operations,
    conflicts: conflictList,
    dirty: !!(operations.length || conflictList.length),
    lastSyncedAt: new Date().toISOString(),
  };
}
export function resolveRecord(
  snapshot: Snapshot,
  key: string,
  choice: "local" | "remote" | { merged: string },
): Snapshot {
  const conflict = snapshot.conflicts?.find((item) => item.key === key);
  if (!conflict) return snapshot;
  const conflicts = (snapshot.conflicts ?? []).filter(
    (item) => item.key !== key,
  );
  let operations = (snapshot.operations ?? []).filter((op) => op.key !== key);
  if (choice !== "remote") {
    const value = choice === "local" ? conflict.local : choice.merged;
    const base = toRecords(snapshot.baseState ?? snapshot.state)[key] ?? null;
    if (!same(base, value))
      operations.push({
        id: crypto.randomUUID(),
        key,
        base,
        value,
        revive: true,
      });
  }
  const state = visibleState(
    snapshot.baseState ?? snapshot.state,
    conflicts,
    operations,
  );
  return {
    ...snapshot,
    state,
    operations,
    conflicts,
    dirty: !!(operations.length || conflicts.length),
    updatedAt: new Date().toISOString(),
  };
}
