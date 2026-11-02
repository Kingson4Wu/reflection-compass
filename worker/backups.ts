import type { PrivateDatabase } from "./tenancy";
import { createBackup } from "../src/backup";
import { stateSchema } from "../src/domain";
import { readProjection, commitProjection } from "./projection";
import { ApiError } from "./errors";
export async function ensureDailyBackup(DB: PrivateDatabase, now = new Date()) {
  const id = "daily:" + now.toISOString().slice(0, 10);
  if (await DB.prepare("SELECT id FROM backups WHERE id=?").bind(id).first())
    return;
  const row = await DB.prepare(
    "SELECT revision,body FROM state WHERE id=1",
  ).first<{ revision: number; body: string }>();
  if (!row) return;
  await DB.batch([
    DB.prepare(
      "INSERT OR IGNORE INTO backups(id,created_at,reason,revision,body) VALUES(?,?,?,?,?)",
    ).bind(id, now.getTime(), "daily", row.revision, row.body),
    DB.prepare(
      "DELETE FROM backups WHERE created_at<? OR id NOT IN (SELECT id FROM backups ORDER BY created_at DESC LIMIT 60)",
    ).bind(now.getTime() - 30 * 86400000),
  ]);
}
const prune = (DB: PrivateDatabase) =>
  DB.prepare(
    "DELETE FROM backups WHERE created_at<? OR id NOT IN (SELECT id FROM backups ORDER BY created_at DESC LIMIT 60)",
  )
    .bind(Date.now() - 30 * 86400000)
    .run();
export async function listBackups(DB: PrivateDatabase) {
  return (
    await DB.prepare(
      "SELECT id,created_at,reason,revision FROM backups ORDER BY created_at DESC LIMIT 60",
    ).all()
  ).results;
}
export async function manualBackup(DB: PrivateDatabase) {
  const current = await readProjection(DB);
  const id = crypto.randomUUID();
  await DB.prepare(
    "INSERT INTO backups(id,created_at,reason,revision,body) VALUES(?,?,?,?,?)",
  )
    .bind(
      id,
      Date.now(),
      "manual",
      current.revision,
      JSON.stringify(current.state),
    )
    .run();
  await prune(DB);
  return { id };
}
export async function downloadBackup(DB: PrivateDatabase, id: string) {
  const row = await DB.prepare("SELECT body,created_at FROM backups WHERE id=?")
    .bind(id)
    .first<{ body: string; created_at: number }>();
  if (!row) throw new ApiError("备份不存在或已经过期。", 404);
  return createBackup(
    stateSchema.parse(JSON.parse(row.body)),
    new Date(row.created_at).toISOString(),
  );
}
export async function restoreBackup(
  DB: PrivateDatabase,
  id: string,
  expectedRevision: number,
) {
  const saved = await DB.prepare("SELECT body FROM backups WHERE id=?")
    .bind(id)
    .first<{ body: string }>();
  if (!saved) throw new ApiError("备份不存在或已经过期。", 404);
  const current = await readProjection(DB);
  if (current.revision !== expectedRevision)
    throw new ApiError("云端已有新修改，请刷新后重新确认恢复。", 409);
  const restored = stateSchema.parse(JSON.parse(saved.body));
  restored.settings.paused = true;
  const revision = await commitProjection(
    DB,
    current.revision,
    current.state,
    restored,
    (guard, args) => [
      DB.prepare(
        `INSERT INTO backups(id,created_at,reason,revision,body) SELECT ?,?,?,?,? WHERE ${guard}`,
      ).bind(
        crypto.randomUUID(),
        Date.now(),
        "before-restore",
        current.revision,
        JSON.stringify(current.state),
        ...args,
      ),
    ],
  );
  if (revision === null)
    throw new ApiError("云端已有新修改，请刷新后重试。", 409);
  await prune(DB);
  return { state: restored, revision };
}
