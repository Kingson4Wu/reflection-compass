import { get, set, del } from "idb-keyval";
import { APP_BASE, apiOrigin } from "./deployment";
import { emptyState, stateSchema, type State } from "./domain";
import { fresh, type Snapshot } from "./sync-model";
import type { SyncResponse } from "./records";
export { fresh };
export type { Snapshot };
const KEY = APP_BASE === "/" ? "compass-v1" : `compass-v1:${APP_BASE}`;
export function accountStorageKey(accountId?: string) {
  return !accountId || accountId === "owner"
    ? KEY
    : KEY + ":account:" + accountId;
}
export const hasStoredSnapshot = async (accountId?: string) =>
  (await get(accountStorageKey(accountId))) !== undefined;
export async function load(accountId?: string): Promise<Snapshot> {
  const stored = await get<Snapshot>(accountStorageKey(accountId));
  if (!stored) return fresh();
  return {
    ...stored,
    state: stateSchema.parse(stored.state),
    ...(stored.baseState
      ? { baseState: stateSchema.parse(stored.baseState) }
      : {}),
  };
}
export const save = (value: Snapshot, accountId?: string) =>
  set(accountStorageKey(accountId), value);
export const clear = async (accountId?: string) => {
  await del(accountStorageKey(accountId));
  await del(accountStorageKey(accountId) + ":restore-point");
};
export interface Device {
  id: string;
  name: string;
  last_seen: number;
  subscribed: boolean;
  current: boolean;
  target: boolean;
}
export interface DeviceList {
  devices: Device[];
  targetId: string | null;
  currentId: string | null;
}
export interface CloudBackup {
  id: string;
  created_at: number;
  reason: string;
  revision: number;
}
interface ApiResponses {
  sync: SyncResponse;
  devices: DeviceList;
  backups: CloudBackup[];
  state: { state: State; revision: number };
  config: { publicKey: string; pushReady: boolean; subscribed: boolean };
  deliveries: {
    id: string;
    status: string;
    attempts: number;
    last_error: string | null;
  }[];
  subscription: { ok: boolean; target?: boolean };
  "push/test": { accepted: boolean };
  data: { ok: boolean };
}
export async function request<T>(
  path: string,
  token: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${apiOrigin()}/api/${path}`, {
    credentials: "omit",
    ...init,
    signal: init.signal ?? AbortSignal.timeout(20000),
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...init.headers,
    },
    cache: "no-store",
  });
  const body: unknown = await response.json();
  if (!response.ok) {
    const error = body as { error?: string };
    throw Object.assign(new Error(error.error ?? "请求失败"), {
      status: response.status,
    });
  }
  return body as T;
}
export async function api<K extends keyof ApiResponses>(
  path: K,
  token: string,
  init: RequestInit = {},
): Promise<ApiResponses[K]> {
  return request<ApiResponses[K]>(path, token, init);
}
export const saveRestorePoint = (snapshot: Snapshot, accountId?: string) =>
  set(accountStorageKey(accountId) + ":restore-point", snapshot);
export const loadRestorePoint = (accountId?: string) =>
  get<Snapshot>(accountStorageKey(accountId) + ":restore-point");
export async function synchronize(
  snapshot: Snapshot,
  token: string,
): Promise<Snapshot> {
  if (snapshot.dirty) {
    const result = await api("state", token, {
      method: "PUT",
      body: JSON.stringify({
        state: snapshot.state,
        revision: snapshot.revision,
      }),
    });
    return { ...snapshot, revision: result.revision, dirty: false };
  }
  const result = await api("state", token);
  return {
    state: stateSchema.parse(result.state),
    revision: result.revision,
    dirty: false,
    updatedAt: new Date().toISOString(),
  };
}
