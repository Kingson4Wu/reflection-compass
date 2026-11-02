import { beforeAll, afterEach, it, expect } from "vitest";
import { build } from "esbuild";
import { Miniflare } from "miniflare";
import { readFile } from "node:fs/promises";
let script = "";
const instances: Miniflare[] = [];
beforeAll(async () => {
  const output = await build({
    entryPoints: ["worker/index.ts"],
    bundle: true,
    write: false,
    format: "esm",
    platform: "browser",
    target: "es2022",
  });
  script = output.outputFiles[0].text;
});
afterEach(async () => {
  await Promise.all(instances.splice(0).map((m) => m.dispose()));
});
for (const upstream of [201, 307, 410])
  it(`runs real Workers crypto and fetch for push HTTP ${upstream} without an open app`, async () => {
    const pair = await crypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["sign", "verify"],
    );
    const jwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
    const client = await crypto.subtle.generateKey(
      { name: "ECDH", namedCurve: "P-256" },
      true,
      ["deriveBits"],
    );
    const encode = (bytes: ArrayBuffer) =>
      Buffer.from(bytes).toString("base64url");
    const bindings = {
      OWNER_TOKEN: "runtime-test-owner-token-at-least-32-chars",
      VAPID_PUBLIC_KEY: encode(
        await crypto.subtle.exportKey("raw", pair.publicKey),
      ),
      VAPID_PRIVATE_KEY: jwk.d!,
      VAPID_SUBJECT: "https://example.com",
    };
    const outbound: {
      method: string;
      encoding: string | null;
      hasVapid: boolean;
      bytes: number;
    }[] = [];
    const mf = new Miniflare({
      workers: [
        {
          name: "runtime-push",
          script,
          modules: true,
          compatibilityDate: "2026-01-01",
          bindings,
          d1Databases: ["DB"],
          outboundService: async (request) => {
            outbound.push({
              method: request.method,
              encoding: request.headers.get("content-encoding"),
              hasVapid:
                request.headers.get("authorization")?.startsWith("vapid t=") ??
                false,
              bytes: (await request.arrayBuffer()).byteLength,
            });
            return new Response(null, {
              status: upstream,
              headers:
                upstream === 307 ? { Location: "https://untrusted.test" } : {},
            });
          },
        },
      ],
    });
    instances.push(mf);
    const DB = await mf.getD1Database("DB");
    for (const sql of (await readFile("worker/schema.sql", "utf8"))
      .split(";")
      .filter((s) => s.trim()))
      await DB.prepare(sql).run();
    await DB.prepare("INSERT INTO subscription VALUES(1,?)")
      .bind(
        JSON.stringify({
          endpoint: "https://web.push.apple.com/test",
          keys: {
            p256dh: encode(
              await crypto.subtle.exportKey("raw", client.publicKey),
            ),
            auth: encode(crypto.getRandomValues(new Uint8Array(16)).buffer),
          },
        }),
      )
      .run();
    const response = await mf.dispatchFetch(
      "https://compass.test/api/push/test",
      {
        method: "POST",
        headers: { Authorization: "Bearer " + bindings.OWNER_TOKEN },
      },
    );
    expect(response.status).toBe(upstream === 201 ? 200 : 502);
    expect(outbound).toEqual([
      { method: "POST", encoding: "aes128gcm", hasVapid: true, bytes: 4096 },
    ]);
    if (upstream === 201)
      expect(await response.json()).toEqual({ accepted: true });
    if (upstream === 410)
      expect(
        await DB.prepare("SELECT id FROM subscription").first(),
      ).toBeNull();
  });
