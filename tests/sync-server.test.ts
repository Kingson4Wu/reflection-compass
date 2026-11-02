import { afterEach, it, expect } from "vitest";
import { Miniflare } from "miniflare";
import { readFile } from "node:fs/promises";
import { synchronizeRecords } from "../worker/sync";
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
const edit = (id: string, key: string, base: unknown, value: unknown) => ({
  id,
  key,
  base,
  value,
});
it("merges edits from concurrent devices without replacing unrelated content", async () => {
  const DB = await db();
  await Promise.all([
    synchronizeRecords(DB, {
      operations: [edit("a", "direction:vision", "", "phone")],
    }),
    synchronizeRecords(DB, {
      operations: [edit("b", "direction:project", "", "mac")],
    }),
  ]);
  const result = await synchronizeRecords(DB, { operations: [] });
  expect(result.state.direction).toMatchObject({
    vision: "phone",
    project: "mac",
  });
});
it("returns both versions of a same-field conflict and keeps its receipt", async () => {
  const DB = await db();
  await synchronizeRecords(DB, {
    operations: [edit("a", "direction:vision", "", "phone")],
  });
  const request = { operations: [edit("b", "direction:vision", "", "mac")] };
  const result = await synchronizeRecords(DB, request);
  expect(result.results[0]).toMatchObject({
    status: "conflict",
    conflict: { local: "mac", remote: "phone" },
  });
  expect((await synchronizeRecords(DB, request)).results).toEqual(
    result.results,
  );
});
it("makes repeated operations idempotent even after later edits", async () => {
  const DB = await db();
  const request = { operations: [edit("a", "direction:vision", "", "first")] };
  await synchronizeRecords(DB, request);
  await synchronizeRecords(DB, {
    operations: [edit("b", "direction:vision", "first", "second")],
  });
  await synchronizeRecords(DB, request);
  expect(
    (await synchronizeRecords(DB, { operations: [] })).state.direction.vision,
  ).toBe("second");
});
it("keeps deleted record tombstones and rejects stale resurrection", async () => {
  const DB = await db();
  await synchronizeRecords(DB, {
    operations: [edit("a", "weekly:2026-11-02", null, "old")],
  });
  await synchronizeRecords(DB, {
    operations: [edit("b", "weekly:2026-11-02", "old", null)],
  });
  const result = await synchronizeRecords(DB, {
    operations: [edit("c", "weekly:2026-11-02", null, "restore")],
  });
  expect(result.results[0].status).toBe("conflict");
  expect(result.state.weekly).toEqual({});
  expect(
    (
      await DB.prepare("SELECT deleted FROM sync_records WHERE key=?")
        .bind("weekly:2026-11-02")
        .first()
    )?.deleted,
  ).toBe(1);
});
