import { it, expect } from "vitest";
import { database } from "./helpers/database";
import {
  inviteMember,
  acceptIdentity,
  removeMember,
  listMembers,
} from "../worker/members";
const google = (sub: string, email: string) => ({ sub, email, name: email });
it("rejects uninvited Google identities and binds owner only explicitly", async () => {
  const DB = await database();
  await expect(
    acceptIdentity(DB, google("x", "owner@gmail.com"), false),
  ).rejects.toThrow();
  const owner = await acceptIdentity(DB, google("x", "owner@gmail.com"), true);
  expect(owner.seat).toBe(1);
  await expect(
    acceptIdentity(DB, google("y", "other@gmail.com"), true),
  ).rejects.toThrow();
  expect(
    (await acceptIdentity(DB, google("x", "changed@gmail.com"), false)).id,
  ).toBe(owner.id);
});
it("reserves at most four additional seats under simultaneous invitations", async () => {
  const DB = await database();
  const results = await Promise.allSettled(
    Array.from({ length: 8 }, (_, i) =>
      inviteMember(DB, `friend${i}@gmail.com`),
    ),
  );
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(4);
  expect(await listMembers(DB)).toHaveLength(5);
});
it("consumes email invitations, expires unused invitations and safely recycles deleted seats", async () => {
  const DB = await database();
  const invited = await inviteMember(DB, "friend@gmail.com");
  const member = await acceptIdentity(
    DB,
    google("f", "friend@gmail.com"),
    false,
  );
  expect(member.id).toBe(invited.id);
  await DB.prepare(
    `INSERT INTO member${member.seat}_state VALUES(1,1,'{}')`,
  ).run();
  await removeMember(DB, member.id);
  expect(
    await DB.prepare(`SELECT * FROM member${member.seat}_state`).all(),
  ).toMatchObject({ results: [] });
  const next = await inviteMember(DB, "next@gmail.com");
  expect(next.id).not.toBe(member.id);
  await DB.prepare("UPDATE accounts SET invited_until=0 WHERE id=?")
    .bind(next.id)
    .run();
  await expect(
    acceptIdentity(DB, google("n", "next@gmail.com"), false),
  ).rejects.toThrow();
  await expect(removeMember(DB, "owner")).rejects.toThrow();
});
