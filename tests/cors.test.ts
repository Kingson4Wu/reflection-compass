import { describe, it, expect } from "vitest";
import { handleRequest } from "../worker/index";
const token = "a".repeat(48);
const env = {
  OWNER_TOKEN: token,
  ALLOWED_ORIGINS: "https://owner.github.io,https://compass.example.com",
} as Parameters<typeof handleRequest>[1];
const origin = "https://owner.github.io";
const request = (
  method = "GET",
  headers: Record<string, string> = {},
  body?: string,
) =>
  new Request("https://compass.workers.dev/api/state", {
    method,
    headers: { Origin: origin, ...headers },
    body,
  });
describe("separate frontend origin", () => {
  it("answers allowlisted preflight without authentication", async () => {
    const r = await handleRequest(
      request("OPTIONS", {
        "Access-Control-Request-Method": "PATCH",
        "Access-Control-Request-Headers": "authorization,content-type",
      }),
      env,
    );
    expect(r.status).toBe(204);
    expect(r.headers.get("Access-Control-Allow-Origin")).toBe(origin);
    expect(
      r.headers.get("Access-Control-Allow-Headers")?.toLowerCase(),
    ).toContain("authorization");
    expect(r.headers.get("Access-Control-Allow-Methods")).toContain("PATCH");
    expect(r.headers.get("Vary")).toContain("Origin");
    expect(r.headers.has("Access-Control-Allow-Credentials")).toBe(false);
  });
  it("makes authentication failures readable to the allowed frontend", async () => {
    const r = await handleRequest(request(), env);
    expect(r.status).toBe(401);
    expect(r.headers.get("Access-Control-Allow-Origin")).toBe(origin);
  });
  it("allows mutations to reach validation and exposes validation errors", async () => {
    const r = await handleRequest(
      request("PUT", { Authorization: "Bearer " + token }, "{}"),
      env,
    );
    expect(r.status).toBe(400);
    expect(r.headers.get("Access-Control-Allow-Origin")).toBe(origin);
  });
  it("blocks unknown origins for reads and writes", async () => {
    for (const method of ["GET", "PUT", "OPTIONS"]) {
      const r = await handleRequest(
        request(method, {
          Origin: "https://evil.test",
          Authorization: "Bearer " + token,
        }),
        env,
      );
      expect(r.status).toBe(403);
      expect(r.headers.has("Access-Control-Allow-Origin")).toBe(false);
    }
  });
  it("rejects unsupported preflight methods and headers", async () => {
    for (const headers of [
      { "Access-Control-Request-Method": "TRACE" },
      {
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers": "x-secret",
      },
    ])
      expect(
        (await handleRequest(request("OPTIONS", headers), env)).status,
      ).toBe(403);
  });
  it("does not serve a frontend from the production API", async () => {
    expect(
      (await handleRequest(new Request("https://compass.workers.dev/"), env))
        .status,
    ).toBe(404);
  });
});
