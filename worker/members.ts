import { z } from "zod";
import { ApiError } from "./errors";
import { PRIVATE_TABLES, partitionSQL } from "./tenancy";
export interface Account {
  seat: number;
  id: string;
  email: string | null;
  subject: string | null;
  name: string;
  status: "owner" | "invited" | "active";
  invited_until: number | null;
  created_at: number;
}
export interface GoogleIdentity {
  sub: string;
  email: string;
  name: string;
}
export async function listMembers(DB: D1Database) {
  return (
    await DB.prepare(
      "SELECT seat,id,email,name,status,invited_until,created_at FROM accounts ORDER BY seat",
    ).all()
  ).results;
}
async function expireInvites(DB: D1Database) {
  await DB.prepare(
    "DELETE FROM accounts WHERE status='invited' AND invited_until<=?",
  )
    .bind(Date.now())
    .run();
}
export async function inviteMember(DB: D1Database, input: unknown) {
  const email = z.email().max(254).parse(input).trim().toLowerCase();
  await expireInvites(DB);
  const id = crypto.randomUUID();
  const row = await DB.prepare(
    "INSERT INTO accounts(seat,id,email,status,invited_until,created_at) SELECT seat,?,?,'invited',?,? FROM (SELECT 2 AS seat UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5) WHERE seat NOT IN (SELECT seat FROM accounts) AND NOT EXISTS(SELECT 1 FROM accounts WHERE email=?) ORDER BY seat LIMIT 1 RETURNING *",
  )
    .bind(id, email, Date.now() + 7 * 86400000, Date.now(), email)
    .first<Account>();
  if (!row)
    throw new ApiError("名额已满（最多 5 人），或此邮箱已加入/已获邀请。", 409);
  return row;
}
export async function acceptIdentity(
  DB: D1Database,
  identity: GoogleIdentity,
  linkOwner: boolean,
) {
  const existing = await DB.prepare("SELECT * FROM accounts WHERE subject=?")
    .bind(identity.sub)
    .first<Account>();
  if (existing) {
    if (linkOwner && existing.seat !== 1)
      throw new ApiError("该 Google 账号已属于其他成员。", 409);
    return existing;
  }
  const email = identity.email.toLowerCase();
  let row: Account | null;
  if (linkOwner) {
    const occupied = await DB.prepare(
      "SELECT seat FROM accounts WHERE email=? AND seat<>1",
    )
      .bind(email)
      .first();
    if (occupied)
      throw new ApiError(
        "该邮箱已有成员/邀请，请先撤销对应邀请再绑定管理员。",
        409,
      );
    row = await DB.prepare(
      "UPDATE accounts SET email=?,subject=?,name=? WHERE seat=1 AND subject IS NULL RETURNING *",
    )
      .bind(email, identity.sub, identity.name)
      .first<Account>();
    if (!row)
      throw new ApiError(
        "管理员已绑定其他 Google 账号，请先使用已绑定账号登录。",
        409,
      );
  } else {
    row = await DB.prepare(
      "UPDATE accounts SET subject=?,name=?,status='active',invited_until=NULL WHERE email=? AND status='invited' AND invited_until>? RETURNING *",
    )
      .bind(identity.sub, identity.name, email, Date.now())
      .first<Account>();
    if (!row)
      throw new ApiError("此账号尚未获邀，或邀请已过期。请联系管理员。", 403);
  }
  return row;
}
export async function removeMember(DB: D1Database, id: string) {
  const row = await DB.prepare("SELECT seat FROM accounts WHERE id=?")
    .bind(id)
    .first<{ seat: number }>();
  if (!row) throw new ApiError("成员不存在。", 404);
  if (row.seat === 1) throw new ApiError("不能移除管理员。", 403);
  await DB.batch([
    ...PRIVATE_TABLES.map((table) =>
      DB.prepare(
        partitionSQL(`DELETE FROM ${table}`, row.seat) +
          " WHERE EXISTS(SELECT 1 FROM accounts WHERE id=?)",
      ).bind(id),
    ),
    DB.prepare("DELETE FROM login_sessions WHERE account_id=?").bind(id),
    DB.prepare("DELETE FROM accounts WHERE id=? AND seat<>1").bind(id),
  ]);
}
