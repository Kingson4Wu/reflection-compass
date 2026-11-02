import { it, expect } from "vitest";
import { createBackup, parseBackup } from "../src/backup";
import { emptyState } from "../src/domain";
it("validates versioned backups and rejects modified content", async () => {
  const state = emptyState();
  state.direction.vision = "original";
  const backup = await createBackup(state);
  expect((await parseBackup(backup)).state).toEqual(state);
  backup.state.direction.vision = "tampered";
  await expect(parseBackup(backup)).rejects.toThrow("校验失败");
});
it("accepts legacy exports without pretending they have a checksum", async () => {
  expect(
    (
      await parseBackup({
        format: "reflection-compass-v1",
        state: emptyState(),
      })
    ).legacy,
  ).toBe(true);
  await expect(
    parseBackup({ format: "other", state: emptyState() }),
  ).rejects.toThrow();
});
