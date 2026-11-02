import { it, expect } from "vitest";
import { database } from "./helpers/database";
import { runAllSchedules } from "../worker/index";
import { emptyState } from "../src/domain";
it("creates independent backups and reminder queues for each active user", async () => {
  const DB = await database();
  await DB.prepare(
    "INSERT INTO accounts VALUES(2,'friend','friend@gmail.com','friend','Friend','active',NULL,0)",
  ).run();
  const state = emptyState();
  state.settings.paused = false;
  state.settings.slots = ["11:00"];
  for (const prefix of ["", "member2_"]) {
    await DB.prepare(`INSERT INTO ${prefix}state VALUES(1,1,?)`)
      .bind(JSON.stringify(state))
      .run();
    await DB.prepare(`INSERT INTO ${prefix}subscription VALUES(1,?)`)
      .bind(
        JSON.stringify({
          endpoint: "https://web.push.apple.com/" + prefix,
          keys: { p256dh: "a".repeat(87), auth: "a".repeat(22) },
        }),
      )
      .run();
  }
  await runAllSchedules(
    { DB } as Parameters<typeof runAllSchedules>[0],
    new Date("2026-11-02T02:00:00Z"),
  );
  for (const prefix of ["", "member2_"]) {
    expect(
      (await DB.prepare(`SELECT count(*) AS n FROM ${prefix}backups`).first())
        ?.n,
    ).toBe(1);
    expect(
      (
        await DB.prepare(
          `SELECT count(*) AS n FROM ${prefix}deliveries`,
        ).first()
      )?.n,
    ).toBe(1);
  }
  expect(
    (await DB.prepare("SELECT count(*) AS n FROM member3_deliveries").first())
      ?.n,
  ).toBe(0);
});
