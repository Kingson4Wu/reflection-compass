import { it, expect } from "vitest";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
it("prepares a production config from Wrangler JSONC with comments and trailing commas", async () => {
  const dir = await mkdtemp(join(tmpdir(), "compass-config-"));
  try {
    await writeFile(
      join(dir, "wrangler.jsonc"),
      '{ // Wrangler accepts JSONC\n "vars":{},"d1_databases":[{"database_id":"placeholder",}],}',
    );
    const result = spawnSync(
      process.execPath,
      [resolve("scripts/worker-config.mjs")],
      {
        cwd: dir,
        env: {
          ...process.env,
          CLOUDFLARE_D1_DATABASE_ID: "11111111-1111-4111-8111-111111111111",
          ALLOWED_ORIGINS: "https://owner.github.io",
        },
        encoding: "utf8",
      },
    );
    expect(result.status, result.stderr).toBe(0);
    const config = JSON.parse(
      await readFile(join(dir, "wrangler.deploy.json"), "utf8"),
    );
    expect(config.vars.ALLOWED_ORIGINS).toBe("https://owner.github.io");
    expect(config.d1_databases[0].database_id).toBe(
      "11111111-1111-4111-8111-111111111111",
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
