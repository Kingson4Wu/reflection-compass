import { it, expect, vi, beforeEach } from "vitest";
const data = vi.hoisted(() => new Map<string, unknown>());
vi.mock("idb-keyval", () => ({
  get: async (key: string) => data.get(key),
  set: async (key: string, value: unknown) => {
    data.set(key, value);
  },
}));
import {
  saveAuth,
  readStoredAuth,
  restoreRememberedAuth,
  installationKey,
} from "../src/auth-storage";
class MemoryStorage {
  data = new Map<string, string>();
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.data.set(key, value);
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
  clear() {
    this.data.clear();
  }
}
beforeEach(() => {
  data.clear();
  vi.stubGlobal("localStorage", new MemoryStorage());
  vi.stubGlobal("sessionStorage", new MemoryStorage());
});
const auth = {
  token: "dv_" + "a".repeat(64),
  id: "phone",
  name: "iPhone",
  remember: true,
  accountId: "owner",
  expiresAt: Date.now() + 30 * 86400000,
};
it("restores a remembered session when its localStorage copy is lost", async () => {
  await saveAuth(auth);
  expect(readStoredAuth()).toEqual(auth);
  localStorage.clear();
  expect(await restoreRememberedAuth()).toEqual(auth);
});
it("does not restore a logged-out or session-only account", async () => {
  await saveAuth(auth);
  await saveAuth({ ...auth, token: "", accountId: "guest" });
  localStorage.clear();
  expect(await restoreRememberedAuth()).toBeUndefined();
  await saveAuth(auth);
  await saveAuth({ ...auth, remember: false });
  expect(readStoredAuth()?.token).toBe(auth.token);
  sessionStorage.clear();
  expect(await restoreRememberedAuth()).toBeUndefined();
});
it("keeps the installation secret across logout and creates a different one for a fresh installation", async () => {
  const key = await installationKey();
  expect(key).toMatch(/^[a-f0-9]{64}$/);
  await saveAuth(auth);
  await saveAuth({ ...auth, token: "" });
  expect(await installationKey()).toBe(key);
  localStorage.clear();
  expect(await installationKey()).toBe(key);
  data.clear();
  localStorage.clear();
  expect(await installationKey()).not.toBe(key);
});
