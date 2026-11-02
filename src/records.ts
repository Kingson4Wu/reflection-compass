import { z } from "zod";
import { emptyState, emptyDay, stateSchema, type State } from "./domain";
export type Value =
  null | boolean | number | string | Value[] | { [key: string]: Value };
export type Records = Record<string, Value>;
export const same = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);
const directionKeys = Object.keys(emptyState().direction),
  settingKeys = Object.keys(emptyState().settings);
const validDate = (s: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(s) &&
  !Number.isNaN(Date.parse(s)) &&
  new Date(s).toISOString().slice(0, 10) === s;
export function validKey(key: string) {
  const [type, a, b, ...rest] = key.split(":");
  if (rest.length) return false;
  if (type === "direction") return !b && directionKeys.includes(a);
  if (type === "settings") return !b && settingKeys.includes(a);
  if (type === "day" || type === "weekly") return !b && validDate(a);
  if (type === "evening")
    return validDate(a) && ["worked", "obstacle", "next"].includes(b);
  if (type === "action" || type === "reflection") {
    try {
      return validDate(a) && !!b && decodeURIComponent(b).length <= 100;
    } catch {
      return false;
    }
  }
  return false;
}
export function toRecords(state: State): Records {
  const records: Records = {};
  for (const [key, value] of Object.entries(state.direction))
    records["direction:" + key] = value;
  for (const [key, value] of Object.entries(state.settings))
    records["settings:" + key] = value;
  for (const [date, day] of Object.entries(state.days)) {
    records["day:" + date] = true;
    day.actions.forEach(
      (action, order) =>
        (records[`action:${date}:${encodeURIComponent(action.id)}`] = {
          ...action,
          order,
        }),
    );
    for (const reflection of day.reflections)
      records[`reflection:${date}:${encodeURIComponent(reflection.id)}`] =
        reflection;
    for (const [key, value] of Object.entries(day.evening))
      records[`evening:${date}:${key}`] = value;
  }
  for (const [date, value] of Object.entries(state.weekly))
    records["weekly:" + date] = value;
  return records;
}
export function fromRecords(records: Records): State {
  const state = emptyState();
  const actions: Record<
    string,
    { order: number; value: State["days"][string]["actions"][number] }[]
  > = {};
  for (const [key, value] of Object.entries(records)) {
    if (!validKey(key)) throw new Error("Invalid record key");
    if (value === null) continue;
    const [type, a, b] = key.split(":");
    if (type === "direction") {
      (state.direction as unknown as Records)[a] = value;
      continue;
    }
    if (type === "settings") {
      (state.settings as unknown as Records)[a] = value;
      continue;
    }
    if (type === "weekly") {
      state.weekly[a] = value as string;
      continue;
    }
    const day = (state.days[a] ??= emptyDay());
    if (type === "action") {
      if (typeof value !== "object" || Array.isArray(value))
        throw new Error("Invalid action");
      if (value.id !== decodeURIComponent(b))
        throw new Error("Action ID mismatch");
      const { order, ...action } = value;
      (actions[a] ??= []).push({
        order: typeof order === "number" ? order : 0,
        value: action as State["days"][string]["actions"][number],
      });
    }
    if (type === "reflection") {
      if (
        typeof value !== "object" ||
        Array.isArray(value) ||
        value.id !== decodeURIComponent(b)
      )
        throw new Error("Reflection ID mismatch");
      day.reflections.push(
        value as State["days"][string]["reflections"][number],
      );
    }
    if (type === "evening") (day.evening as unknown as Records)[b] = value;
    if (type === "day" && value !== true) throw new Error("Invalid day");
  }
  for (const [date, items] of Object.entries(actions))
    state.days[date].actions = items
      .sort((a, b) => a.order - b.order || a.value.id.localeCompare(b.value.id))
      .map((item) => item.value);
  for (const day of Object.values(state.days))
    day.reflections.sort(
      (a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id),
    );
  return stateSchema.parse(state);
}
export interface Change {
  key: string;
  base: Value;
  value: Value;
}
export function changes(base: State, local: State): Change[] {
  const before = toRecords(base),
    after = toRecords(local);
  return [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter((key) => !same(before[key] ?? null, after[key] ?? null))
    .map((key) => ({
      key,
      base: before[key] ?? null,
      value: after[key] ?? null,
    }));
}
export function mergeValue(
  base: Value,
  local: Value,
  remote: Value,
): { ok: true; value: Value } | { ok: false } {
  if (same(local, remote)) return { ok: true, value: remote };
  if (same(base, remote)) return { ok: true, value: local };
  if (same(base, local)) return { ok: true, value: remote };
  if (
    base &&
    local &&
    remote &&
    typeof base === "object" &&
    typeof local === "object" &&
    typeof remote === "object" &&
    !Array.isArray(base) &&
    !Array.isArray(local) &&
    !Array.isArray(remote)
  ) {
    const result: Records = {};
    for (const key of new Set([
      ...Object.keys(base),
      ...Object.keys(local),
      ...Object.keys(remote),
    ])) {
      const merged = mergeValue(
        base[key] ?? null,
        local[key] ?? null,
        remote[key] ?? null,
      );
      if (!merged.ok) return { ok: false };
      if (merged.value !== null) result[key] = merged.value;
    }
    return { ok: true, value: result };
  }
  return { ok: false };
}
export const operationSchema = z.object({
  id: z.string().min(1).max(100),
  key: z.string().max(400).refine(validKey),
  base: z.json(),
  value: z.json(),
  revive: z.boolean().optional(),
});
export type Operation = z.infer<typeof operationSchema>;
export interface PendingOperation extends Operation {
  sent?: boolean;
}
export interface RecordConflict {
  id: string;
  key: string;
  base: Value;
  local: Value;
  remote: Value;
  reason: string;
}
export interface SyncResponse {
  state: State;
  revision: number;
  results: (
    | { id: string; key: string; status: "applied" }
    | { id: string; key: string; status: "conflict"; conflict: RecordConflict }
  )[];
}
