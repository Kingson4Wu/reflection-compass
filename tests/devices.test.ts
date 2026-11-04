import { it, expect, afterEach } from "vitest";
import { Miniflare } from "miniflare";
import { readFile } from "node:fs/promises";
import {
  registerDevice,
  listDevices,
  saveSubscription,
  selectTarget,
  removeDevice,
} from "../worker/devices";
import { authenticate } from "../worker/auth";
const instances: Miniflare[] = [];
afterEach(async () => {
  await Promise.all(instances.splice(0).map((m) => m.dispose()));
});
async function db() {
  const m = new Miniflare({
    workers: [
      {
        name: "test",
        modules: true,
        script: 'export default {fetch(){return new Response("ok")}}',
        d1Databases: ["DB"],
      },
    ],
  });
  instances.push(m);
  const DB = await m.getD1Database("DB");
  for (const sql of (await readFile("worker/schema.sql", "utf8"))
    .split(";")
    .filter((s) => s.trim()))
    await DB.prepare(sql).run();
  return DB as unknown as D1Database;
}
it("issues a device credential once and revokes it without changing other devices", async () => {
  const DB = await db();
  const device = await registerDevice(
    DB,
    { owner: true },
    { id: "device-phone", name: "Phone" },
  );
  expect(device.token).toMatch(/^dv_/);
  const env = { DB, OWNER_TOKEN: "a".repeat(48) };
  const req = new Request("https://app.test", {
    headers: { Authorization: "Bearer " + device.token },
  });
  expect(await authenticate(req, env)).toMatchObject({
    deviceId: "device-phone",
  });
  expect(JSON.stringify(await listDevices(DB))).not.toContain(device.token);
  await removeDevice(DB, "device-phone");
  expect(await authenticate(req, env)).toBeNull();
});
it("new device login and notification subscription do not steal the existing phone target", async () => {
  const DB = await db();
  const original = JSON.stringify({
    endpoint: "https://web.push.apple.com/original",
    keys: { p256dh: "a", auth: "b" },
  });
  await DB.prepare("INSERT INTO subscription VALUES(1,?)").bind(original).run();
  await registerDevice(
    DB,
    { owner: true },
    { id: "device-macbook", name: "Mac" },
  );
  expect((await listDevices(DB)).targetId).toBe("legacy-phone");
  expect(
    await saveSubscription(
      DB,
      { owner: false, deviceId: "device-macbook" },
      JSON.stringify({
        endpoint: "https://fcm.googleapis.com/new",
        keys: { p256dh: "c", auth: "d" },
      }),
    ),
  ).toEqual({ target: false });
  expect(
    (await DB.prepare("SELECT body FROM subscription").first())?.body,
  ).toBe(original);
  await selectTarget(DB, "device-macbook");
  expect((await listDevices(DB)).targetId).toBe("device-macbook");
});

it("clears invalid subscriptions from both the receiving target and device controls", async () => {
  const { invalidateSubscription } = await import("../worker/devices");
  const DB = await db();
  await registerDevice(
    DB,
    { owner: true },
    { id: "phone-current", name: "Phone" },
  );
  const body = JSON.stringify({
    endpoint: "https://web.push.apple.com/invalid",
    keys: { p256dh: "key", auth: "auth" },
  });
  await saveSubscription(DB, { owner: false, deviceId: "phone-current" }, body);
  await invalidateSubscription(DB, body);
  const list = await listDevices(DB, "phone-current");
  expect(list.targetId).toBeNull();
  expect(list.devices[0].subscribed).toBe(false);
});

it("does not erase renewed keys or another target when an older subscription is rejected", async () => {
  const { invalidateSubscription } = await import("../worker/devices");
  const DB = await db();
  await registerDevice(
    DB,
    { owner: true },
    { id: "phone-current", name: "Phone" },
  );
  const old = JSON.stringify({
    endpoint: "https://web.push.apple.com/same",
    keys: { p256dh: "old", auth: "old" },
  });
  const renewed = JSON.stringify({
    endpoint: "https://web.push.apple.com/same",
    keys: { p256dh: "new", auth: "new" },
  });
  await saveSubscription(
    DB,
    { owner: false, deviceId: "phone-current" },
    renewed,
  );
  await invalidateSubscription(DB, old);
  const list = await listDevices(DB, "phone-current");
  expect(list.targetId).toBe("phone-current");
  expect(list.devices[0].subscribed).toBe(true);
});
