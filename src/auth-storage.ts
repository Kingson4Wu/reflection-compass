import { get, set } from "idb-keyval";
import { APP_BASE, sessionKey } from "./deployment";
import type { User } from "./account";

export interface Auth {
  token: string;
  id: string;
  name: string;
  remember: boolean;
  accountId?: string;
  user?: User;
  expiresAt?: number;
}
const AUTH_KEY = "compass-auth:" + APP_BASE;
const INSTALL_KEY = "compass-installation:" + APP_BASE;
let writes = Promise.resolve();
function valid(value: unknown): value is Auth {
  if (!value || typeof value !== "object") return false;
  const auth = value as Auth;
  return (
    typeof auth.token === "string" &&
    typeof auth.id === "string" &&
    typeof auth.name === "string" &&
    typeof auth.remember === "boolean"
  );
}
export function readStoredAuth(): Auth | undefined {
  for (const storage of [() => localStorage, () => sessionStorage]) {
    try {
      const raw = storage().getItem(AUTH_KEY);
      if (raw) {
        const value: unknown = JSON.parse(raw);
        if (valid(value)) return value;
      }
    } catch {}
  }
}
export async function restoreRememberedAuth(): Promise<Auth | undefined> {
  await writes;
  const value: unknown = await get(AUTH_KEY);
  return valid(value) && value.remember && value.token ? value : undefined;
}
export function saveAuth(value: Auth): Promise<void> {
  let stored = false;
  try {
    localStorage.removeItem(AUTH_KEY);
    sessionStorage.removeItem(AUTH_KEY);
    sessionStorage.removeItem(sessionKey);
    (value.remember ? localStorage : sessionStorage).setItem(
      AUTH_KEY,
      JSON.stringify(value),
    );
    stored = true;
  } catch {}
  const result = writes.then(async () => {
    try {
      // A tombstone prevents sign-out/session-only login from resurrecting an old account.
      await set(AUTH_KEY, value.remember && value.token ? value : null);
    } catch (error) {
      if (!stored || !value.remember || !value.token) throw error;
    }
  });
  writes = result.catch(() => {});
  return result;
}
let pendingInstallation: Promise<string> | undefined;
export function installationKey(): Promise<string> {
  if (!pendingInstallation)
    pendingInstallation = (async () => {
      let value: unknown;
      try {
        value = localStorage.getItem(INSTALL_KEY);
      } catch {}
      if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) {
        try {
          value = await get(INSTALL_KEY);
        } catch {}
      }
      if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) {
        value = Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) =>
          byte.toString(16).padStart(2, "0"),
        ).join("");
      }
      let stored = false;
      try {
        localStorage.setItem(INSTALL_KEY, value as string);
        stored = true;
      } catch {}
      try {
        await set(INSTALL_KEY, value);
      } catch (error) {
        if (!stored) throw error;
      }
      return value as string;
    })().finally(() => {
      pendingInstallation = undefined;
    });
  return pendingInstallation;
}
