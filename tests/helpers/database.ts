import { afterEach } from "vitest";
import { Miniflare } from "miniflare";
import { readFile } from "node:fs/promises";
const instances: Miniflare[] = [];
afterEach(async () => {
  await Promise.all(instances.splice(0).map((m) => m.dispose()));
});
export async function database() {
  const mf = new Miniflare({
    modules: true,
    script: 'export default {fetch(){return new Response("ok")}}',
    d1Databases: ["DB"],
  });
  instances.push(mf);
  const DB = await mf.getD1Database("DB");
  for (const sql of (await readFile("worker/schema.sql", "utf8"))
    .split(";")
    .filter((s) => s.trim()))
    await DB.prepare(sql).run();
  return DB as unknown as D1Database;
}
