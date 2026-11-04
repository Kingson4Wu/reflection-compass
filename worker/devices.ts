import type { PrivateDatabase } from "./tenancy";
import { z } from "zod";
import { hashSecret, type AuthContext } from "./auth";
import { ApiError } from "./errors";
const cancel = (DB: PrivateDatabase) =>
  DB.prepare(
    "UPDATE deliveries SET status='cancelled' WHERE status IN ('pending','retry','processing')",
  );
export async function listDevices(DB: PrivateDatabase, current?: string) {
  const rows = await DB.prepare(
    "SELECT id,name,last_seen,subscription IS NOT NULL AS subscribed FROM devices ORDER BY last_seen DESC",
  ).all<{ id: string; name: string; last_seen: number; subscribed: number }>();
  const target = await DB.prepare(
    "SELECT device_id FROM notification_target WHERE id=1",
  ).first<{ device_id: string }>();
  const legacy = await DB.prepare(
    "SELECT body FROM subscription WHERE id=1",
  ).first();
  const targetId = target?.device_id ?? (legacy ? "legacy-phone" : null);
  const devices = rows.results.map((row) => ({
    ...row,
    subscribed: !!row.subscribed,
    current: row.id === current,
    target: row.id === targetId,
  }));
  if (legacy && targetId === "legacy-phone")
    devices.push({
      id: "legacy-phone",
      name: "旧版提醒订阅",
      last_seen: 0,
      subscribed: true,
      current: false,
      target: true,
    });
  return { devices, targetId, currentId: current ?? null };
}
export async function registerDevice(
  DB: PrivateDatabase,
  auth: AuthContext,
  input: unknown,
) {
  const data = z
    .object({
      id: z.string().regex(/^[a-zA-Z0-9_-]{8,100}$/),
      name: z.string().trim().min(1).max(80),
    })
    .parse(input);
  if (!auth.owner) {
    if (auth.deviceId !== data.id)
      throw new ApiError("此设备不能注册其他设备。", 403);
    await DB.prepare("UPDATE devices SET name=?,last_seen=? WHERE id=?")
      .bind(data.name, Date.now(), data.id)
      .run();
    return { id: data.id, name: data.name };
  }
  const count = await DB.prepare(
    "SELECT count(*) AS n FROM devices WHERE id<>?",
  )
    .bind(data.id)
    .first<{ n: number }>();
  if ((count?.n ?? 0) >= 30)
    throw new ApiError("最多保留 30 台设备，请先移除旧设备。");
  const token =
    "dv_" +
    crypto.randomUUID().replaceAll("-", "") +
    crypto.randomUUID().replaceAll("-", "");
  await DB.prepare(
    "INSERT INTO devices(id,name,token_hash,last_seen) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,token_hash=excluded.token_hash,last_seen=excluded.last_seen",
  )
    .bind(data.id, data.name, await hashSecret(token), Date.now())
    .run();
  return { id: data.id, name: data.name, token };
}
export async function selectTarget(DB: PrivateDatabase, id: string) {
  if (id === "legacy-phone") {
    const old = await DB.prepare(
      "SELECT body FROM subscription WHERE id=1",
    ).first();
    if (!old) throw new ApiError("原有设备订阅已失效。");
    return;
  }
  const row = await DB.prepare("SELECT subscription FROM devices WHERE id=?")
    .bind(id)
    .first<{ subscription: string | null }>();
  if (!row?.subscription) throw new ApiError("请先在这台设备上开启通知。");
  await DB.batch([
    DB.prepare(
      "INSERT OR REPLACE INTO subscription(id,body) SELECT 1,subscription FROM devices WHERE id=? AND subscription IS NOT NULL",
    ).bind(id),
    DB.prepare(
      "INSERT OR REPLACE INTO notification_target(id,device_id) VALUES(1,?)",
    ).bind(id),
    cancel(DB),
  ]);
}
export async function saveSubscription(
  DB: PrivateDatabase,
  auth: AuthContext,
  body: string,
) {
  if (auth.owner) {
    await DB.batch([
      DB.prepare(
        "INSERT OR REPLACE INTO subscription(id,body) VALUES(1,?)",
      ).bind(body),
      DB.prepare(
        "INSERT OR REPLACE INTO notification_target(id,device_id) VALUES(1,'legacy-phone')",
      ),
      cancel(DB),
    ]);
    return { target: true };
  }
  await DB.prepare("UPDATE devices SET subscription=? WHERE id=?")
    .bind(body, auth.deviceId)
    .run();
  const existing = await DB.prepare(
    "SELECT body FROM subscription WHERE id=1",
  ).first<{ body: string }>();
  const target = await DB.prepare(
    "SELECT device_id FROM notification_target WHERE id=1",
  ).first<{ device_id: string }>();
  const old = existing ? JSON.parse(existing.body) : null,
    value = JSON.parse(body);
  const identical =
    old &&
    old.endpoint === value.endpoint &&
    old.keys?.p256dh === value.keys?.p256dh &&
    old.keys?.auth === value.keys?.auth;
  if (!existing || identical || target?.device_id === auth.deviceId) {
    await selectTarget(DB, auth.deviceId!);
    return { target: true };
  }
  return { target: false };
}
export async function removeSubscription(
  DB: PrivateDatabase,
  auth: AuthContext,
) {
  if (auth.deviceId)
    await DB.prepare("UPDATE devices SET subscription=NULL WHERE id=?")
      .bind(auth.deviceId)
      .run();
  const target = await DB.prepare(
    "SELECT device_id FROM notification_target WHERE id=1",
  ).first<{ device_id: string }>();
  if (auth.owner || target?.device_id === auth.deviceId) {
    await DB.batch([
      DB.prepare("DELETE FROM subscription"),
      DB.prepare("DELETE FROM notification_target"),
      cancel(DB),
    ]);
  }
}
export async function removeDevice(DB: PrivateDatabase, id: string) {
  const target = await DB.prepare(
    "SELECT device_id FROM notification_target WHERE id=1",
  ).first<{ device_id: string }>();
  const isTarget =
    target?.device_id === id || (!target && id === "legacy-phone");
  const statements = [DB.prepare("DELETE FROM devices WHERE id=?").bind(id)];
  if (isTarget)
    statements.push(
      DB.prepare("DELETE FROM subscription"),
      DB.prepare("DELETE FROM notification_target"),
      cancel(DB),
    );
  await DB.batch(statements);
}

// Update JSON in place inside one transaction: target selection can change between
// requests, so the selected subscription must be guarded at write time.
export async function updateSubscriptionLocale(
  DB: PrivateDatabase,
  auth: AuthContext,
  locale: "zh-CN" | "en",
) {
  if (!auth.deviceId) {
    if (!auth.owner) return { updated: false };
    const result = await DB.prepare(
      "UPDATE subscription SET body=json_set(body,'$.locale',?) WHERE id=1 AND NOT EXISTS(SELECT 1 FROM notification_target WHERE id=1 AND device_id<>'legacy-phone')",
    )
      .bind(locale)
      .run();
    return { updated: result.meta.changes > 0 };
  }
  const results = await DB.batch([
    DB.prepare(
      "UPDATE devices SET subscription=json_set(subscription,'$.locale',?) WHERE id=? AND subscription IS NOT NULL",
    ).bind(locale, auth.deviceId),
    DB.prepare(
      "UPDATE subscription SET body=json_set(body,'$.locale',?) WHERE id=1 AND EXISTS(SELECT 1 FROM notification_target WHERE id=1 AND device_id=?) AND EXISTS(SELECT 1 FROM devices WHERE id=? AND subscription IS NOT NULL)",
    ).bind(locale, auth.deviceId, auth.deviceId),
  ]);
  return { updated: results[0].meta.changes > 0 };
}

// Remove only the exact subscription rejected by the push provider: a device may
// already have renewed its keys while an older delivery was in flight.
export async function invalidateSubscription(
  DB: PrivateDatabase,
  body: string,
) {
  const matches = (column: string) =>
    `json_extract(${column},'$.endpoint')=json_extract(?,'$.endpoint') AND json_extract(${column},'$.keys.p256dh')=json_extract(?,'$.keys.p256dh') AND json_extract(${column},'$.keys.auth')=json_extract(?,'$.keys.auth')`;
  await DB.batch([
    DB.prepare(`DELETE FROM subscription WHERE ${matches("body")}`).bind(
      body,
      body,
      body,
    ),
    DB.prepare(
      `UPDATE devices SET subscription=NULL WHERE ${matches("subscription")}`,
    ).bind(body, body, body),
    DB.prepare(
      "DELETE FROM notification_target WHERE NOT EXISTS(SELECT 1 FROM subscription WHERE id=1)",
    ),
  ]);
}
