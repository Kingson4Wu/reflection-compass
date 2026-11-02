import { database } from "./helpers/database";
import { it, expect, vi, afterEach } from "vitest";
import { handleRequest } from "../worker/index";
afterEach(() => vi.unstubAllGlobals());
it("reports a test-send failure instead of an unrelated data-save error", async () => {
  const env = await createEnv();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockRejectedValue(new Error("upstream unavailable")),
  );
  const response = await handleRequest(
    new Request("https://compass.test/api/push/test", {
      method: "POST",
      headers: { Authorization: "Bearer " + env.OWNER_TOKEN },
    }),
    env,
  );
  expect(response.status).toBe(502);
  const body = (await response.json()) as { code: string; error: string };
  expect(body.code).toBe("PUSH_TEST_FAILED");
  expect(body.error).toContain("测试推送失败");
  expect(JSON.stringify(body)).not.toContain(env.VAPID_PRIVATE_KEY);
});

async function createEnv() {
  const vapid = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  const jwk = await crypto.subtle.exportKey("jwk", vapid.privateKey);
  const client = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  );
  const encode = (bytes: ArrayBuffer) =>
    Buffer.from(bytes).toString("base64url");
  const subscription = {
    endpoint: "https://web.push.apple.com/test",
    keys: {
      p256dh: encode(await crypto.subtle.exportKey("raw", client.publicKey)),
      auth: encode(crypto.getRandomValues(new Uint8Array(16)).buffer),
    },
  };
  const DB = await database();
  await DB.prepare("INSERT INTO subscription VALUES(1,?)")
    .bind(JSON.stringify(subscription))
    .run();
  const env = {
    OWNER_TOKEN: "a".repeat(48),
    VAPID_PUBLIC_KEY: encode(
      await crypto.subtle.exportKey("raw", vapid.publicKey),
    ),
    VAPID_PRIVATE_KEY: jwk.d!,
    VAPID_SUBJECT: "https://example.com",
    DB,
  } as Parameters<typeof handleRequest>[1];
  return env;
}

it("uses the redirect mode supported by Workers and does not follow push redirects", async () => {
  const env = await createEnv();
  const fetcher = vi.fn().mockResolvedValue(
    new Response(null, {
      status: 307,
      headers: { Location: "https://other.test" },
    }),
  );
  vi.stubGlobal("fetch", fetcher);
  const response = await handleRequest(
    new Request("https://compass.test/api/push/test", {
      method: "POST",
      headers: { Authorization: "Bearer " + env.OWNER_TOKEN },
    }),
    env,
  );
  expect(fetcher.mock.calls[0][1].redirect).toBe("manual");
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(response.status).toBe(502);
});
