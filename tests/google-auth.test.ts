import { it, expect, vi } from "vitest";
import { generateKeyPair, exportJWK, SignJWT, createLocalJWKSet } from "jose";
import {
  verifyGoogleToken,
  createChallenge,
  consumeChallenge,
} from "../worker/google-auth";
import { database } from "./helpers/database";
it("verifies signature, audience, issuer, expiry, nonce and authoritative verified email", async () => {
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const jwk = await exportJWK(publicKey);
  jwk.kid = "test";
  const keys = createLocalJWKSet({ keys: [jwk] });
  const claims = {
    sub: "123",
    email: "friend@gmail.com",
    email_verified: true,
    nonce: "expected",
    name: "Friend",
  };
  const sign = (patch: Record<string, unknown> = {}) =>
    new SignJWT({ ...claims, ...patch })
      .setProtectedHeader({ alg: "RS256", kid: "test" })
      .setIssuedAt()
      .setIssuer("https://accounts.google.com")
      .setAudience("client")
      .setExpirationTime("5m")
      .sign(privateKey);
  const token = await sign();
  expect(
    await verifyGoogleToken(token, "client", "expected", keys),
  ).toMatchObject({ sub: "123", email: "friend@gmail.com" });
  await expect(
    verifyGoogleToken(token, "other", "expected", keys),
  ).rejects.toThrow();
  await expect(
    verifyGoogleToken(token, "client", "wrong", keys),
  ).rejects.toThrow();
  await expect(
    verifyGoogleToken(
      await sign({ email_verified: false }),
      "client",
      "expected",
      keys,
    ),
  ).rejects.toThrow();
  await expect(
    verifyGoogleToken(
      await sign({ email: "friend@example.net" }),
      "client",
      "expected",
      keys,
    ),
  ).rejects.toThrow();
  const expired = await new SignJWT(claims)
    .setProtectedHeader({ alg: "RS256", kid: "test" })
    .setIssuedAt()
    .setIssuer("https://accounts.google.com")
    .setAudience("client")
    .setExpirationTime(1)
    .sign(privateKey);
  await expect(
    verifyGoogleToken(expired, "client", "expected", keys),
  ).rejects.toThrow();
});
it("requires the browser verifier and consumes login challenges only once", async () => {
  const DB = await database();
  const verifier = "a".repeat(64);
  const c = await createChallenge(DB, verifier, false, "test-ip");
  await expect(consumeChallenge(DB, c.id, "b".repeat(64))).rejects.toThrow();
  expect(await consumeChallenge(DB, c.id, verifier)).toMatchObject({
    nonce: c.nonce,
    owner_link: 0,
  });
  await expect(consumeChallenge(DB, c.id, verifier)).rejects.toThrow();
  const expired = await createChallenge(DB, verifier, false, "test-ip");
  await DB.prepare("UPDATE login_challenges SET expires_at=0 WHERE id=?")
    .bind(expired.id)
    .run();
  await expect(consumeChallenge(DB, expired.id, verifier)).rejects.toThrow();
});
it("limits challenge generation within one minute", async () => {
  const clock = vi
    .spyOn(Date, "now")
    .mockReturnValue(Date.UTC(2026, 10, 2, 12, 0, 0));
  try {
    const DB = await database();
    for (let i = 0; i < 20; i++)
      await createChallenge(DB, "a".repeat(64), false, "same-ip");
    await expect(
      createChallenge(DB, "a".repeat(64), false, "same-ip"),
    ).rejects.toThrow("频繁");
    clock.mockReturnValue(Date.UTC(2026, 10, 2, 12, 1, 0));
    await expect(
      createChallenge(DB, "a".repeat(64), false, "same-ip"),
    ).resolves.toHaveProperty("nonce");
  } finally {
    clock.mockRestore();
  }
});

it("reuses an installation per account across Google logins without losing its subscription", async () => {
  const { finishGoogleLogin } = await import("../worker/google-auth");
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const jwk = await exportJWK(publicKey);
  jwk.kid = "login";
  const keys = createLocalJWKSet({ keys: [jwk] });
  const DB = await database();
  const login = async (
    deviceKey: string,
    email = "owner@gmail.com",
    sub = "owner-sub",
    link = false,
  ) => {
    const verifier = "a".repeat(64);
    const challenge = await createChallenge(
      DB,
      verifier,
      link,
      crypto.randomUUID(),
    );
    const credential = await new SignJWT({
      sub,
      email,
      email_verified: true,
      nonce: challenge.nonce,
    })
      .setProtectedHeader({ alg: "RS256", kid: "login" })
      .setIssuedAt()
      .setIssuer("https://accounts.google.com")
      .setAudience("client")
      .setExpirationTime("5m")
      .sign(privateKey);
    return finishGoogleLogin(
      DB,
      "client",
      {
        challengeId: challenge.id,
        verifier,
        credential,
        name: "iPhone",
        deviceKey,
      },
      keys,
    );
  };
  const first = await login("a".repeat(64), undefined, undefined, true);
  await DB.prepare("UPDATE devices SET subscription=? WHERE id=?")
    .bind('{"endpoint":"https://web.push.apple.com/existing"}', first.id)
    .run();
  const again = await login("a".repeat(64));
  expect(again.id).toBe(first.id);
  expect(again.token).not.toBe(first.token);
  expect((await DB.prepare("SELECT count(*) n FROM devices").first())?.n).toBe(
    1,
  );
  expect(
    (
      await DB.prepare("SELECT subscription FROM devices WHERE id=?")
        .bind(again.id)
        .first()
    )?.subscription,
  ).toContain("existing");
  expect(again.expiresAt - Date.now()).toBeGreaterThan(29 * 86400000);
  const otherInstall = await login("b".repeat(64));
  expect(otherInstall.id).not.toBe(first.id);
  const { inviteMember } = await import("../worker/members");
  await inviteMember(DB, "member@gmail.com");
  const otherAccount = await login(
    "a".repeat(64),
    "member@gmail.com",
    "member-sub",
  );
  expect(otherAccount.id).not.toBe(first.id);
});
