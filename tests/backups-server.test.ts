import { it, expect, afterEach } from "vitest";
import { Miniflare } from "miniflare";
import { readFile } from "node:fs/promises";
import { emptyState } from "../src/domain";
import {
  ensureDailyBackup,
  manualBackup,
  restoreBackup,
  listBackups,
} from "../worker/backups";
import { readProjection, commitProjection } from "../worker/projection";
const instances: Miniflare[] = [];
afterEach(async () => {
  await Promise.all(instances.splice(0).map((m) => m.dispose()));
});
async function setup() {
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
  const state = emptyState();
  state.direction.vision = "original";
  await DB.prepare("INSERT INTO state VALUES(1,1,?)")
    .bind(JSON.stringify(state))
    .run();
  return DB as unknown as D1Database;
}
it("takes a daily backup even with reminders paused and only once each day", async () => {
  const DB = await setup();
  await ensureDailyBackup(DB, new Date("2026-11-02T12:00:00Z"));
  await ensureDailyBackup(DB, new Date("2026-11-02T13:00:00Z"));
  expect(await listBackups(DB)).toHaveLength(1);
});
it("restores with a recovery point, pauses reminders and rejects stale confirmation", async () => {
  const DB = await setup();
  const saved = await manualBackup(DB);
  const old = await readProjection(DB);
  const changed = structuredClone(old.state);
  changed.direction.vision = "new";
  changed.settings.paused = false;
  await commitProjection(DB, old.revision, old.state, changed);
  await expect(restoreBackup(DB, saved.id, 1)).rejects.toThrow("新修改");
  const restored = await restoreBackup(DB, saved.id, 2);
  expect(restored.state.direction.vision).toBe("original");
  expect(restored.state.settings.paused).toBe(true);
  expect(
    (await listBackups(DB)).some((b: any) => b.reason === "before-restore"),
  ).toBe(true);
});
