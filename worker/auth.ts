import { privateDatabase } from "./tenancy";
export interface AuthContext {
  owner: boolean;
  deviceId?: string;
  seat?: number;
  accountId?: string;
  admin?: boolean;
}
export async function hashSecret(value: string) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
  )
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
export async function authenticate(
  request: Request,
  env: { OWNER_TOKEN: string; DB: D1Database },
): Promise<AuthContext | null> {
  if (!env.OWNER_TOKEN || env.OWNER_TOKEN.length < 32) return null;
  const token =
    request.headers.get("Authorization")?.replace(/^Bearer /, "") ?? "";
  if (token.length < 32) return null;
  const [provided, owner] = await Promise.all([
    hashSecret(token),
    hashSecret(env.OWNER_TOKEN),
  ]);
  let difference = 0;
  for (let i = 0; i < provided.length; i++)
    difference |= provided.charCodeAt(i) ^ owner.charCodeAt(i);
  if (!difference)
    return { owner: true, seat: 1, accountId: "owner", admin: true };
  if (!/^dv_[a-f0-9]{64}$/.test(token)) return null;
  const session = await env.DB.prepare(
    "SELECT account_id,device_id,expires_at FROM login_sessions WHERE token_hash=?",
  )
    .bind(provided)
    .first<{ account_id: string; device_id: string; expires_at: number }>();
  let seat = 1,
    accountId = "owner";
  if (session) {
    if (session.expires_at <= Date.now()) return null;
    const account = await env.DB.prepare(
      "SELECT seat FROM accounts WHERE id=? AND status IN ('owner','active')",
    )
      .bind(session.account_id)
      .first<{ seat: number }>();
    if (!account) return null;
    seat = account.seat;
    accountId = session.account_id;
  }
  const DB = privateDatabase(env.DB, seat);
  const device = await DB.prepare("SELECT id FROM devices WHERE token_hash=?")
    .bind(provided)
    .first<{ id: string }>();
  if (!device) return null;
  await DB.prepare("UPDATE devices SET last_seen=? WHERE id=? AND last_seen<?")
    .bind(Date.now(), device.id, Date.now() - 60000)
    .run();
  return {
    owner: false,
    deviceId: device.id,
    seat,
    accountId,
    admin: seat === 1,
  };
}
