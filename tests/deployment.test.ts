import { describe, it, expect, vi, afterEach } from "vitest";
import { normalizeBase, normalizeApiOrigin } from "../scripts/deployment.mjs";
import { api } from "../src/store";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe("deployment configuration", () => {
  it("normalizes root and project base paths", () => {
    expect(normalizeBase("")).toBe("/");
    expect(normalizeBase("/reflection-compass")).toBe("/reflection-compass/");
    expect(normalizeBase("/")).toBe("/");
  });
  it("rejects base paths that escape the application", () => {
    for (const value of [
      "https://example.com",
      "//evil/",
      "/../other/",
      "/a?b/",
      "/a%2fb/",
    ])
      expect(() => normalizeBase(value)).toThrow();
  });
  it("uses HTTPS API origins without paths or credentials", () => {
    expect(normalizeApiOrigin("https://api.example.com/")).toBe(
      "https://api.example.com",
    );
    expect(normalizeApiOrigin("http://localhost:8787")).toBe(
      "http://localhost:8787",
    );
    for (const value of [
      "http://api.example.com",
      "https://user:pass@api.example.com",
      "https://api.example.com/api",
      "https://api.example.com/?a=1",
    ])
      expect(() => normalizeApiOrigin(value)).toThrow();
  });
  it("sends authenticated requests to the configured backend without cookies", async () => {
    vi.stubEnv("VITE_API_BASE_URL", "https://api.example.com");
    const fetcher = vi
      .fn()
      .mockResolvedValue(Response.json({ revision: 0, state: {} }));
    vi.stubGlobal("fetch", fetcher);
    await api("state", "owner-secret");
    expect(fetcher.mock.calls[0][0]).toBe("https://api.example.com/api/state");
    expect(fetcher.mock.calls[0][1]).toMatchObject({
      credentials: "omit",
      headers: { Authorization: "Bearer owner-secret" },
    });
  });
});
