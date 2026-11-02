import { afterEach, describe, it, expect } from "vitest";
import { Miniflare } from "miniflare";
import { readFile } from "node:fs/promises";
import { runSchedule } from "../worker/index";
import { emptyState } from "../src/domain";
const instances: Miniflare[] = [];
afterEach(async () => {
  await Promise.all(instances.splice(0).map((m) => m.dispose()));
});
async function setup() {
  const mf = new Miniflare({
    workers: [
      {
        name: "test",
        modules: true,
        script: 'export default {fetch(){return new Response("ok")}}',
        d1Databases: ["DB"],
      },
    ],
  });
  instances.push(mf);
  const DB = await mf.getD1Database("DB");
  const schema = await readFile(
    new URL("../worker/schema.sql", import.meta.url),
    "utf8",
  );
  for (const sql of schema.split(";").filter((s) => s.trim()))
    await DB.prepare(sql).run();
  const state = emptyState();
  state.settings.paused = false;
  state.settings.slots = ["11:00"];
  await DB.prepare("INSERT INTO state VALUES(1,1,?)")
    .bind(JSON.stringify(state))
    .run();
  await DB.prepare("INSERT INTO subscription VALUES(1,?)")
    .bind(
      JSON.stringify({
        endpoint: "https://web.push.apple.com/test",
        keys: { p256dh: "a".repeat(87), auth: "a".repeat(22) },
      }),
    )
    .run();
  return {
    DB,
    state,
    env: { DB } as unknown as Parameters<typeof runSchedule>[0],
  };
}
describe("real D1 scheduler", () => {
  it("deduplicates an occurrence and limits retries", async () => {
    const { DB, env } = await setup();
    await runSchedule(env, new Date("2026-11-02T02:00:00Z"));
    await runSchedule(env, new Date("2026-11-02T02:00:01Z"));
    expect(
      (await DB.prepare("SELECT count(*) AS n FROM deliveries").first())?.n,
    ).toBe(1);
    expect(
      (await DB.prepare("SELECT attempts FROM deliveries").first())?.attempts,
    ).toBe(1);
    await runSchedule(env, new Date("2026-11-02T02:01:00Z"));
    await runSchedule(env, new Date("2026-11-02T02:03:00Z"));
    const row = await DB.prepare(
      "SELECT status,attempts FROM deliveries",
    ).first();
    expect(row).toMatchObject({ status: "failed", attempts: 3 });
  });
  it("does not retry a pending push once quiet hours begin", async () => {
    const { DB, env, state } = await setup();
    state.settings.quietStart = "11:01";
    state.settings.quietEnd = "12:00";
    await DB.prepare("UPDATE state SET body=?")
      .bind(JSON.stringify(state))
      .run();
    await runSchedule(env, new Date("2026-11-02T02:00:00Z"));
    await runSchedule(env, new Date("2026-11-02T02:01:00Z"));
    expect(
      (await DB.prepare("SELECT attempts FROM deliveries").first())?.attempts,
    ).toBe(1);
  });
  it("does not send an expired occurrence", async () => {
    const { DB, env } = await setup();
    await runSchedule(env, new Date("2026-11-02T02:00:00Z"));
    await runSchedule(env, new Date("2026-11-02T02:06:00Z"));
    expect(
      await DB.prepare("SELECT status,attempts FROM deliveries").first(),
    ).toMatchObject({ status: "expired", attempts: 1 });
  });
});
