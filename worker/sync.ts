import type { PrivateDatabase } from "./tenancy";
import { z } from "zod";
import {
  toRecords,
  fromRecords,
  mergeValue,
  same,
  operationSchema,
  type Value,
  type RecordConflict,
  type SyncResponse,
} from "../src/records";
import { readProjection, commitProjection } from "./projection";
const requestSchema = z.object({
  operations: z.array(operationSchema).max(100),
  deviceId: z.string().max(100).optional(),
});
const fingerprint = async (value: unknown) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(JSON.stringify(value)),
      ),
    ),
  )
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
export async function synchronizeRecords(
  DB: PrivateDatabase,
  input: unknown,
): Promise<SyncResponse> {
  const { operations } = requestSchema.parse(input);
  if (new Set(operations.map((op) => op.id)).size !== operations.length)
    throw new Error("同一批操作 ID 不能重复");
  for (let attempt = 0; attempt < 6; attempt++) {
    const current = await readProjection(DB);
    if (!operations.length) return { ...current, results: [] };
    const cachedRows = await DB.prepare(
      "SELECT id,fingerprint,result FROM sync_operations WHERE id IN (SELECT value FROM json_each(?))",
    )
      .bind(JSON.stringify(operations.map((op) => op.id)))
      .all<{ id: string; fingerprint: string; result: string }>();
    const cached = new Map(cachedRows.results.map((row) => [row.id, row]));
    const records = toRecords(current.state);
    const results: SyncResponse["results"] = [],
      receipts: { id: string; fingerprint: string; result: string }[] = [];
    const tombstones = await DB.prepare(
      "SELECT key FROM sync_records WHERE deleted=1",
    ).all<{ key: string }>();
    const deleted = new Set(tombstones.results.map((row) => row.key));
    for (const op of operations) {
      const hash = await fingerprint(op);
      const receipt = cached.get(op.id);
      if (receipt) {
        if (receipt.fingerprint !== hash)
          throw new Error("操作 ID 已用于不同内容");
        results.push(JSON.parse(receipt.result));
        continue;
      }
      const remote = records[op.key] ?? null;
      const merged =
        deleted.has(op.key) &&
        op.base === null &&
        op.value !== null &&
        !op.revive
          ? { ok: false as const }
          : mergeValue(op.base as Value, op.value as Value, remote);
      let conflict: RecordConflict | undefined;
      if (merged.ok) {
        const candidate = { ...records, [op.key]: merged.value };
        try {
          fromRecords(candidate);
          records[op.key] = merged.value;
          if (merged.value === null) deleted.add(op.key);
          else deleted.delete(op.key);
        } catch {
          conflict = {
            id: op.id,
            key: op.key,
            base: op.base as Value,
            local: op.value as Value,
            remote,
            reason: "合并后不符合记录规则，请保留一个版本或先整理当日行动。",
          };
        }
      } else
        conflict = {
          id: op.id,
          key: op.key,
          base: op.base as Value,
          local: op.value as Value,
          remote,
          reason: deleted.has(op.key)
            ? "云端记录已删除，请确认是否恢复。"
            : "两台设备修改了同一内容，两个版本均已保留。",
        };
      const result: SyncResponse["results"][number] = conflict
        ? { id: op.id, key: op.key, status: "conflict", conflict }
        : { id: op.id, key: op.key, status: "applied" };
      results.push(result);
      receipts.push({
        id: op.id,
        fingerprint: hash,
        result: JSON.stringify(result),
      });
    }
    if (!receipts.length) return { ...current, results };
    const after = fromRecords(records);
    const committed = await commitProjection(
      DB,
      current.revision,
      current.state,
      after,
      (guard, args) => [
        DB.prepare(
          `INSERT OR IGNORE INTO sync_operations(id,fingerprint,result,created_at) SELECT json_extract(item.value,'$.id'),json_extract(item.value,'$.fingerprint'),json_extract(item.value,'$.result'),? FROM json_each(?) AS item WHERE ${guard}`,
        ).bind(Date.now(), JSON.stringify(receipts), ...args),
      ],
    );
    if (committed !== null) return { ...(await readProjection(DB)), results };
  }
  throw new Error("同步繁忙，请稍后重试。");
}
