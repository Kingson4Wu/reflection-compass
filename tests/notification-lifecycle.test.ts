import { describe, it, expect, vi, afterEach } from "vitest";
import { Miniflare } from "miniflare";
import { readFile } from "node:fs/promises";
import { runSchedule, handleRequest } from "../worker/index";
import { emptyState } from "../src/domain";
const instances: Miniflare[] = [];
afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(instances.splice(0).map((m) => m.dispose()));
});
async function setup() {
  const mf = new Miniflare({
    workers: [
      {
        name: "test",
        modules: true,
        script: 'export default {fetch(){return new Response("ok")}}',
        d1Databases: ["DB"],
      },
    ],
  });
  instances.push(mf);
  const DB = await mf.getD1Database("DB");
  for (const sql of (await readFile("worker/schema.sql", "utf8"))
    .split(";")
    .filter((s) => s.trim()))
    await DB.prepare(sql).run();
  const state = emptyState();
  state.settings.paused = false;
  state.settings.slots = ["11:00"];
  await DB.prepare("INSERT INTO state VALUES(1,1,?)")
    .bind(JSON.stringify(state))
    .run();
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
  const encode = (value: ArrayBuffer) =>
    Buffer.from(value).toString("base64url");
  const sub = {
    endpoint: "https://web.push.apple.com/test",
    keys: {
      p256dh: encode(await crypto.subtle.exportKey("raw", client.publicKey)),
      auth: encode(crypto.getRandomValues(new Uint8Array(16)).buffer),
    },
  };
  await DB.prepare("INSERT INTO subscription VALUES(1,?)")
    .bind(JSON.stringify(sub))
    .run();
  const env = {
    DB,
    OWNER_TOKEN: "a".repeat(48),
    VAPID_PUBLIC_KEY: encode(
      await crypto.subtle.exportKey("raw", pair.publicKey),
    ),
    VAPID_PRIVATE_KEY: jwk.d!,
    VAPID_SUBJECT: "https://example.com",
  } as unknown as Parameters<typeof runSchedule>[0];
  return { DB, state, env };
}
const at = (time: string) => new Date("2026-11-02T" + time + "Z");
describe("server reminders independent of open app", () => {
  it("sends and records an accepted reminder with no frontend client", async () => {
    const { DB, env } = await setup();
    const send = vi.fn().mockResolvedValue(new Response(null, { status: 201 }));
    vi.stubGlobal("fetch", send);
    await runSchedule(env, at("02:00:00"));
    await runSchedule(env, at("02:01:00"));
    expect(send).toHaveBeenCalledTimes(1);
    expect(
      await DB.prepare("SELECT status,attempts FROM deliveries").first(),
    ).toMatchObject({ status: "accepted", attempts: 1 });
    expect(send.mock.calls[0][1].redirect).toBe("manual");
  });
  it("claims a due occurrence once across concurrent cron runs", async () => {
    const { DB, env } = await setup();
    const send = vi.fn().mockResolvedValue(new Response(null, { status: 201 }));
    vi.stubGlobal("fetch", send);
    await Promise.all([
      runSchedule(env, at("02:00:00")),
      runSchedule(env, at("02:00:00")),
    ]);
    expect(send).toHaveBeenCalledTimes(1);
    expect(
      (await DB.prepare("SELECT count(*) n FROM deliveries").first())?.n,
    ).toBe(1);
  });
  for (const status of [429, 500])
    it(`retries HTTP ${status} and recovers without an open app`, async () => {
      const { DB, env } = await setup();
      const send = vi
        .fn()
        .mockResolvedValueOnce(new Response(null, { status }))
        .mockResolvedValue(new Response(null, { status: 201 }));
      vi.stubGlobal("fetch", send);
      await runSchedule(env, at("02:00:00"));
      expect(
        (await DB.prepare("SELECT status FROM deliveries").first())?.status,
      ).toBe("retry");
      await runSchedule(env, at("02:00:30"));
      expect(send).toHaveBeenCalledTimes(1);
      await runSchedule(env, at("02:01:00"));
      expect(
        await DB.prepare("SELECT status,attempts FROM deliveries").first(),
      ).toMatchObject({ status: "accepted", attempts: 2 });
    });
  for (const status of [404, 410])
    it(`clears expired subscription on HTTP ${status} and stops retrying`, async () => {
      const { DB, env } = await setup();
      const send = vi.fn().mockResolvedValue(new Response(null, { status }));
      vi.stubGlobal("fetch", send);
      await runSchedule(env, at("02:00:00"));
      await runSchedule(env, at("02:01:00"));
      expect(
        await DB.prepare("SELECT id FROM subscription").first(),
      ).toBeNull();
      expect(
        (await DB.prepare("SELECT status FROM deliveries").first())?.status,
      ).toBe("failed");
      expect(send).toHaveBeenCalledTimes(1);
    });
  it("retries a transient network outage then succeeds", async () => {
    const { DB, env } = await setup();
    const send = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue(new Response(null, { status: 201 }));
    vi.stubGlobal("fetch", send);
    await runSchedule(env, at("02:00:00"));
    await runSchedule(env, at("02:01:00"));
    expect(
      await DB.prepare("SELECT status,attempts FROM deliveries").first(),
    ).toMatchObject({ status: "accepted", attempts: 2 });
  });
  it("recovers a crashed sender after its lease expires", async () => {
    const { DB, env } = await setup();
    const epoch = at("02:00:00").getTime() / 1000;
    await DB.prepare(
      "INSERT INTO deliveries(id,day,question,status,attempts,expires,available,lease) VALUES('2026-11-02:11:00','2026-11-02','q','processing',1,?,?, 'old')",
    )
      .bind(epoch + 300, epoch + 60)
      .run();
    const send = vi.fn().mockResolvedValue(new Response(null, { status: 201 }));
    vi.stubGlobal("fetch", send);
    await runSchedule(env, at("02:00:30"));
    expect(send).not.toHaveBeenCalled();
    await runSchedule(env, at("02:01:00"));
    expect(send).toHaveBeenCalledTimes(1);
    expect(
      await DB.prepare("SELECT status,attempts FROM deliveries").first(),
    ).toMatchObject({ status: "accepted", attempts: 2 });
  });
  it("cancels a queued retry when pause is saved before closing the app", async () => {
    const { DB, env, state } = await setup();
    const send = vi.fn().mockResolvedValue(new Response(null, { status: 500 }));
    vi.stubGlobal("fetch", send);
    await runSchedule(env, at("02:00:00"));
    state.settings.paused = true;
    const response = await handleRequest(
      new Request("https://app.test/api/state", {
        method: "PUT",
        headers: { Authorization: "Bearer " + env.OWNER_TOKEN },
        body: JSON.stringify({ revision: 1, state }),
      }),
      env,
    );
    expect(response.status).toBe(200);
    await runSchedule(env, at("02:01:00"));
    expect(
      (await DB.prepare("SELECT status FROM deliveries").first())?.status,
    ).toBe("cancelled");
    expect(send).toHaveBeenCalledTimes(1);
  });
  it("cancels an old queued occurrence when its time is edited", async () => {
    const { DB, env, state } = await setup();
    const send = vi.fn().mockResolvedValue(new Response(null, { status: 500 }));
    vi.stubGlobal("fetch", send);
    await runSchedule(env, at("02:00:00"));
    state.settings.slots = ["12:00"];
    const response = await handleRequest(
      new Request("https://app.test/api/state", {
        method: "PUT",
        headers: { Authorization: "Bearer " + env.OWNER_TOKEN },
        body: JSON.stringify({ revision: 1, state }),
      }),
      env,
    );
    expect(response.status).toBe(200);
    await runSchedule(env, at("02:01:00"));
    expect(
      (await DB.prepare("SELECT status FROM deliveries").first())?.status,
    ).toBe("cancelled");
    expect(send).toHaveBeenCalledTimes(1);
  });
  it("does not backfill a reminder after the due window has passed", async () => {
    const { DB, env } = await setup();
    const send = vi.fn();
    vi.stubGlobal("fetch", send);
    await runSchedule(env, at("02:06:00"));
    expect(send).not.toHaveBeenCalled();
    expect(
      (await DB.prepare("SELECT count(*) n FROM deliveries").first())?.n,
    ).toBe(0);
  });
});

it("tests the requesting device rather than silently sending to the legacy target", async () => {
  const { DB, env } = await setup();
  const { registerDevice, saveSubscription } =
    await import("../worker/devices");
  const device = await registerDevice(
    DB,
    { owner: true },
    { id: "current-phone", name: "iPhone" },
  );
  const legacy = (await DB.prepare("SELECT body FROM subscription").first<{
    body: string;
  }>())!;
  const sub = {
    ...JSON.parse(legacy.body),
    endpoint: "https://web.push.apple.com/current",
  };
  await saveSubscription(
    DB,
    { owner: false, deviceId: device.id },
    JSON.stringify(sub),
  );
  const send = vi.fn().mockResolvedValue(new Response(null, { status: 201 }));
  vi.stubGlobal("fetch", send);
  const response = await handleRequest(
    new Request("https://app.test/api/push/test", {
      method: "POST",
      headers: { Authorization: "Bearer " + device.token },
      body: JSON.stringify({ currentDevice: true }),
    }),
    env,
  );
  expect(response.status).toBe(200);
  expect(send.mock.calls[0][0]).toBe(sub.endpoint);
  expect(
    (await DB.prepare("SELECT body FROM subscription").first())?.body,
  ).toBe(legacy.body);
});
it("does not send a current-device test to another phone when this device has no subscription", async () => {
  const { DB, env } = await setup();
  const { registerDevice } = await import("../worker/devices");
  const device = await registerDevice(
    DB,
    { owner: true },
    { id: "current-phone", name: "iPhone" },
  );
  const send = vi.fn();
  vi.stubGlobal("fetch", send);
  const response = await handleRequest(
    new Request("https://app.test/api/push/test", {
      method: "POST",
      headers: { Authorization: "Bearer " + device.token },
      body: JSON.stringify({ currentDevice: true }),
    }),
    env,
  );
  expect(response.status).toBe(400);
  expect(send).not.toHaveBeenCalled();
});

it("requires a registered device for an explicit current-device test even with the recovery credential", async () => {
  const { env } = await setup();
  const send = vi.fn();
  vi.stubGlobal("fetch", send);
  const response = await handleRequest(
    new Request("https://app.test/api/push/test", {
      method: "POST",
      headers: { Authorization: "Bearer " + env.OWNER_TOKEN },
      body: JSON.stringify({ currentDevice: true }),
    }),
    env,
  );
  expect(response.status).toBe(400);
  expect(send).not.toHaveBeenCalled();
});
