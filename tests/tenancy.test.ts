import { it, expect, afterEach } from "vitest";
import { Miniflare } from "miniflare";
import { readFile } from "node:fs/promises";
import { privateDatabase, partitionSQL } from "../worker/tenancy";
import { synchronizeRecords } from "../worker/sync";
import { manualBackup, listBackups } from "../worker/backups";
import { database } from "./helpers/database";
it("separates state, operation receipts, backups and deletion for independent members", async () => {
  const root = await database();
  const a = privateDatabase(root, 1),
    b = privateDatabase(root, 2);
  for (const [DB, value] of [
    [a, "owner"],
    [b, "friend"],
  ] as const)
    await synchronizeRecords(DB, {
      operations: [{ id: "same-id", key: "direction:vision", base: "", value }],
    });
  expect(
    (await synchronizeRecords(a, { operations: [] })).state.direction.vision,
  ).toBe("owner");
  expect(
    (await synchronizeRecords(b, { operations: [] })).state.direction.vision,
  ).toBe("friend");
  await manualBackup(b);
  expect(await listBackups(a)).toHaveLength(0);
  expect(await listBackups(b)).toHaveLength(1);
  await b.prepare("DELETE FROM state").run();
  expect(
    (await synchronizeRecords(a, { operations: [] })).state.direction.vision,
  ).toBe("owner");
});
it("only allows fixed server-selected partitions and preserves SQL strings/column names", () => {
  expect(() => privateDatabase({} as D1Database, 6)).toThrow();
  expect(
    partitionSQL(
      "SELECT subscription FROM devices WHERE id=? AND name='state'",
      2,
    ),
  ).toBe(
    "SELECT subscription FROM member2_devices WHERE id=? AND name='state'",
  );
  expect(
    partitionSQL("UPDATE state SET revision=state.revision+1 WHERE id=1", 3),
  ).toBe(
    "UPDATE member3_state SET revision=member3_state.revision+1 WHERE id=1",
  );
});
it("blocks an already-authorized request after its seat is removed and reused", async () => {
  const DB = await database();
  await DB.prepare(
    "INSERT INTO accounts VALUES(2,'old','old@gmail.com','old-sub','Old','active',NULL,0)",
  ).run();
  const stale = privateDatabase(DB, 2, "old");
  await stale.prepare("INSERT INTO state VALUES(1,1,?)").bind("{}").run();
  await DB.prepare(
    "UPDATE accounts SET id='new',subject='new-sub' WHERE seat=2",
  ).run();
  await expect(stale.prepare("DELETE FROM state").run()).rejects.toThrow();
  expect(
    await DB.prepare("SELECT id FROM member2_state").first(),
  ).toMatchObject({ id: 1 });
});
