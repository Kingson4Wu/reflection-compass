import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { createPwa } from "../scripts/pwa.mjs";
describe("project-path PWA", () => {
  it("generates an app-scoped manifest and precache", async () => {
    const source = await readFile("public/sw.js", "utf8");
    const built = createPwa(
      "/reflection-compass/",
      ["index-test.js", "index-test.css"],
      source,
    );
    expect(built.manifest).toMatchObject({
      id: "/reflection-compass/",
      name: "Reflection Compass",
      short_name: "Compass",
      scope: "/reflection-compass/",
      start_url: "/reflection-compass/",
    });
    expect(
      built.manifest.icons.every((icon) =>
        icon.src.startsWith("/reflection-compass/"),
      ),
    ).toBe(true);
    expect(built.enManifest).toMatchObject({
      id: built.manifest.id,
      scope: built.manifest.scope,
      start_url: built.manifest.start_url,
      lang: "en",
      name: "Reflection Compass",
      short_name: "Compass",
    });
    expect(built.sw).toContain("/reflection-compass/manifest-en.webmanifest");
    expect(built.sw).toContain("/reflection-compass/assets/index-test.js");
    expect(built.sw).not.toContain('"/assets/');
  });
  it("opens notification links inside the frontend base and ignores other apps", async () => {
    const source = await readFile("public/sw.js", "utf8");
    const { sw } = createPwa("/reflection-compass/", ["test.js"], source);
    const handlers: Record<string, (event: any) => void> = {};
    let opened = "";
    let navigated = false;
    const self = {
      location: {
        href: "https://owner.github.io/reflection-compass/sw.js",
        origin: "https://owner.github.io",
      },
      addEventListener: (name: string, handler: any) =>
        (handlers[name] = handler),
      clients: {
        matchAll: async () => [
          {
            url: "https://owner.github.io/other-app/",
            navigate: async () => {
              navigated = true;
            },
            focus: async () => {},
          },
        ],
        openWindow: async (url: string) => {
          opened = url;
        },
      },
    };
    runInNewContext(sw, { self, URL });
    let pending: Promise<unknown> | undefined;
    handlers.notificationclick({
      notification: {
        close() {},
        data: { url: "?view=reflect&day=2026-11-02" },
      },
      waitUntil: (promise: Promise<unknown>) => (pending = promise),
    });
    await pending;
    expect(opened).toBe(
      "https://owner.github.io/reflection-compass/?view=reflect&day=2026-11-02",
    );
    expect(navigated).toBe(false);
  });
});
