import type { PrivateDatabase } from "./tenancy";
import { emptyState, stateSchema, type State } from "../src/domain";
import { changes } from "../src/records";
export async function readProjection(DB: PrivateDatabase) {
  const row = await DB.prepare(
    "SELECT revision,body FROM state WHERE id=1",
  ).first<{ revision: number; body: string }>();
  return {
    revision: row?.revision ?? 0,
    state: row ? stateSchema.parse(JSON.parse(row.body)) : emptyState(),
  };
}
export async function commitProjection(
  DB: PrivateDatabase,
  revision: number,
  before: State,
  after: State,
  extras?: (guard: string, args: [string, number]) => D1PreparedStatement[],
) {
  const token = crypto.randomUUID(),
    next = revision + 1;
  const guard =
    "EXISTS(SELECT 1 FROM sync_guard WHERE id=1 AND token=?) AND EXISTS(SELECT 1 FROM state WHERE id=1 AND revision=?)";
  const args: [string, number] = [token, next];
  const statements = [
    DB.prepare(
      "INSERT OR REPLACE INTO sync_guard(id,token) SELECT 1,? WHERE EXISTS(SELECT 1 FROM state WHERE id=1 AND revision=?) OR (?=0 AND NOT EXISTS(SELECT 1 FROM state WHERE id=1))",
    ).bind(token, revision, revision),
    DB.prepare(
      "INSERT INTO state(id,revision,body) SELECT 1,1,? WHERE EXISTS(SELECT 1 FROM sync_guard WHERE token=?) ON CONFLICT(id) DO UPDATE SET revision=state.revision+1,body=excluded.body WHERE state.revision=? AND EXISTS(SELECT 1 FROM sync_guard WHERE token=?) RETURNING revision",
    ).bind(JSON.stringify(after), token, revision, token),
  ];
  const rows = changes(before, after).map((change) => ({
    key: change.key,
    value: change.value === null ? null : JSON.stringify(change.value),
    deleted: change.value === null ? 1 : 0,
  }));
  if (rows.length)
    statements.push(
      DB.prepare(
        `INSERT INTO sync_records(key,value,revision,deleted) SELECT json_extract(item.value,'$.key'),json_extract(item.value,'$.value'),?,json_extract(item.value,'$.deleted') FROM json_each(?) AS item WHERE ${guard} ON CONFLICT(key) DO UPDATE SET value=excluded.value,revision=excluded.revision,deleted=excluded.deleted`,
      ).bind(next, JSON.stringify(rows), ...args),
    );
  if (JSON.stringify(before.settings) !== JSON.stringify(after.settings))
    statements.push(
      DB.prepare(
        `UPDATE deliveries SET status='cancelled' WHERE status IN ('pending','retry','processing') AND ${guard}`,
      ).bind(...args),
    );
  statements.push(...(extras?.(guard, args) ?? []));
  const result = await DB.batch(statements);
  return result[1].results.length ? next : null;
}
