import { describe, it, expect } from "vitest";
import { handleRequest } from "../worker/index";
const token = "a".repeat(48);
const env = {
  OWNER_TOKEN: token,
  ASSETS: { fetch: async () => new Response("shell") },
} as Parameters<typeof handleRequest>[1];
describe("personal API boundary", () => {
  it("serves public health without private data", async () => {
    const r = await handleRequest(
      new Request("https://compass.test/api/health"),
      env,
    );
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true });
  });
  it("rejects an unauthenticated state read before touching D1", async () => {
    expect(
      (await handleRequest(new Request("https://compass.test/api/state"), env))
        .status,
    ).toBe(401);
  });
  it("fails closed when owner secret is not configured", async () => {
    expect(
      (
        await handleRequest(
          new Request("https://compass.test/api/state", {
            headers: { Authorization: "Bearer " + token },
          }),
          { ...env, OWNER_TOKEN: "" },
        )
      ).status,
    ).toBe(401);
  });
  it("rejects cross-origin mutations", async () => {
    expect(
      (
        await handleRequest(
          new Request("https://compass.test/api/state", {
            method: "PUT",
            headers: {
              Authorization: "Bearer " + token,
              Origin: "https://other.test",
            },
            body: "{}",
          }),
          env,
        )
      ).status,
    ).toBe(403);
  });
  it("rejects endpoint injection rather than requesting an arbitrary URL", async () => {
    const r = await handleRequest(
      new Request("https://compass.test/api/subscription", {
        method: "POST",
        headers: { Authorization: "Bearer " + token },
        body: JSON.stringify({
          endpoint: "https://127.0.0.1/internal",
          keys: { p256dh: "x".repeat(87), auth: "x".repeat(22) },
        }),
      }),
      env,
    );
    expect(r.status).toBe(400);
  });
  it("rejects malformed snapshots", async () => {
    expect(
      (
        await handleRequest(
          new Request("https://compass.test/api/state", {
            method: "PUT",
            headers: { Authorization: "Bearer " + token },
            body: "{}",
          }),
          env,
        )
      ).status,
    ).toBe(400);
  });
});
