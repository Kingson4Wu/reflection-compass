import { describe, it, expect, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { createPwa } from "../scripts/pwa.mjs";
async function setup() {
  const listeners: Record<string, (event: any) => void> = {};
  const self = {
    location: { href: "https://owner.github.io/reflection-compass/sw.js" },
    registration: { showNotification: vi.fn().mockResolvedValue(undefined) },
    clients: {
      matchAll: vi.fn().mockResolvedValue([]),
      openWindow: vi.fn().mockResolvedValue(undefined),
      claim: vi.fn().mockResolvedValue(undefined),
    },
    addEventListener: (name: string, fn: (event: any) => void) =>
      (listeners[name] = fn),
  };
  const caches = {
    keys: vi.fn().mockResolvedValue([]),
    delete: vi.fn().mockResolvedValue(true),
  };
  const built = createPwa(
    "/reflection-compass/",
    ["app.js"],
    await readFile("public/sw.js", "utf8"),
  );
  runInNewContext(built.sw, { self, caches, URL });
  async function dispatch(name: string, payload: Record<string, unknown>) {
    const pending: Promise<unknown>[] = [];
    listeners[name]({
      ...payload,
      waitUntil: (promise: Promise<unknown>) => pending.push(promise),
    });
    await Promise.all(pending);
    return pending.length;
  }
  return { self, caches, dispatch };
}
describe("service worker without an open application", () => {
  it("displays a visible push without consulting any application window", async () => {
    const { self, dispatch } = await setup();
    expect(
      await dispatch("push", {
        data: {
          json: () => ({
            title: "暂停一下",
            body: "观察当前行动",
            url: "?view=reflect&day=2026-11-02",
            tag: "occurrence",
          }),
        },
      }),
    ).toBe(1);
    expect(self.registration.showNotification).toHaveBeenCalledWith(
      "暂停一下",
      expect.objectContaining({
        body: "观察当前行动",
        icon: "https://owner.github.io/reflection-compass/icon-192.png",
        tag: "occurrence",
      }),
    );
    expect(self.clients.matchAll).not.toHaveBeenCalled();
  });
  it("still displays a notification when the push JSON is malformed", async () => {
    const { self, dispatch } = await setup();
    await dispatch("push", {
      data: {
        json: () => {
          throw new SyntaxError("invalid");
        },
      },
    });
    expect(self.registration.showNotification).toHaveBeenCalledWith(
      "给自己一次停顿",
      expect.objectContaining({ body: "打开应用，看看今天的方向。" }),
    );
  });
  it("displays an empty push rather than treating it as silent background work", async () => {
    const { self, dispatch } = await setup();
    await dispatch("push", {});
    expect(self.registration.showNotification).toHaveBeenCalledTimes(1);
  });
  it("cold-opens the exact reflection URL when every app window is closed", async () => {
    const { self, dispatch } = await setup();
    const close = vi.fn();
    await dispatch("notificationclick", {
      notification: {
        close,
        data: { url: "?view=reflect&day=2026-11-02&question=hello" },
      },
    });
    expect(close).toHaveBeenCalled();
    expect(self.clients.openWindow).toHaveBeenCalledWith(
      "https://owner.github.io/reflection-compass/?view=reflect&day=2026-11-02&question=hello",
    );
  });
  it("focuses an existing app window instead of opening a duplicate", async () => {
    const { self, dispatch } = await setup();
    const navigate = vi.fn().mockResolvedValue(undefined),
      focus = vi.fn().mockResolvedValue(undefined);
    self.clients.matchAll.mockResolvedValue([
      { url: "https://owner.github.io/reflection-compass/", navigate, focus },
    ] as never);
    await dispatch("notificationclick", {
      notification: { close() {}, data: { url: "?view=reflect" } },
    });
    expect(navigate).toHaveBeenCalledWith(
      "https://owner.github.io/reflection-compass/?view=reflect",
    );
    expect(focus).toHaveBeenCalledTimes(1);
    expect(self.clients.openWindow).not.toHaveBeenCalled();
  });
  for (const url of ["https://evil.test/", "/other-app/"])
    it(`rejects notification navigation outside the app: ${url}`, async () => {
      const { self, dispatch } = await setup();
      await dispatch("notificationclick", {
        notification: { close() {}, data: { url } },
      });
      expect(self.clients.openWindow).not.toHaveBeenCalled();
      expect(self.clients.matchAll).not.toHaveBeenCalled();
    });
  it("does not remove another app cache when a new worker activates", async () => {
    const { self, caches, dispatch } = await setup();
    caches.keys.mockResolvedValue([
      "compass-shell:/other-app/:old",
      "unrelated-cache",
      "compass-shell:/reflection-compass/:old",
    ] as never);
    await dispatch("activate", {});
    expect(caches.delete).toHaveBeenCalledTimes(1);
    expect(caches.delete).toHaveBeenCalledWith(
      "compass-shell:/reflection-compass/:old",
    );
    expect(self.clients.claim).toHaveBeenCalled();
  });
});
