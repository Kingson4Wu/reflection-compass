import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import { z } from "zod";
import { hashSecret } from "./auth";
import { ApiError } from "./errors";
import { acceptIdentity, type GoogleIdentity } from "./members";
import { privateDatabase } from "./tenancy";
import { registerDevice } from "./devices";
const googleKeys = createRemoteJWKSet(
  new URL("https://www.googleapis.com/oauth2/v3/certs"),
);
export async function verifyGoogleToken(
  token: string,
  clientId: string,
  nonce: string,
  keys: JWTVerifyGetKey = googleKeys,
): Promise<GoogleIdentity> {
  const { payload } = await jwtVerify(token, keys, {
    issuer: ["https://accounts.google.com", "accounts.google.com"],
    audience: clientId,
    algorithms: ["RS256"],
    requiredClaims: ["sub", "exp", "iat", "nonce", "email", "email_verified"],
    clockTolerance: 10,
    maxTokenAge: "1h",
  });
  if (
    payload.nonce !== nonce ||
    payload.email_verified !== true ||
    typeof payload.email !== "string" ||
    typeof payload.sub !== "string" ||
    !payload.sub ||
    payload.sub.length > 255
  )
    throw new ApiError("Google 身份验证失败。", 401);
  // For invitations Google must be authoritative for the email, not merely have
  // verified a third-party address once in the past.
  if (
    !payload.email.toLowerCase().endsWith("@gmail.com") &&
    typeof payload.hd !== "string"
  )
    throw new ApiError("请使用 Gmail 或 Google Workspace 账号登录。", 403);
  return {
    sub: payload.sub,
    email: payload.email.toLowerCase(),
    name:
      typeof payload.name === "string"
        ? payload.name.slice(0, 100)
        : payload.email,
  };
}
export async function createChallenge(
  DB: D1Database,
  verifier: string,
  ownerLink: boolean,
  ipKey: string,
) {
  z.string()
    .regex(/^[a-f0-9]{64}$/)
    .parse(verifier);
  const now = Date.now();
  const bucket = await hashSecret(ipKey + ":" + Math.floor(now / 60000));
  const result = await DB.batch([
    DB.prepare("DELETE FROM login_limits WHERE expires_at<?").bind(now),
    DB.prepare("DELETE FROM login_challenges WHERE expires_at<?").bind(now),
    DB.prepare(
      "INSERT INTO login_limits(bucket,attempts,expires_at) VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE SET attempts=attempts+1 RETURNING attempts",
    ).bind(bucket, now + 120000),
  ]);
  if (
    ((result[2].results[0] as { attempts: number } | undefined)?.attempts ??
      21) > 20
  )
    throw new ApiError("登录请求过于频繁，请一分钟后重试。", 429);
  const id = crypto.randomUUID(),
    nonce = crypto.randomUUID();
  await DB.prepare(
    "INSERT INTO login_challenges(id,nonce,verifier_hash,expires_at,owner_link) VALUES(?,?,?,?,?)",
  )
    .bind(
      id,
      nonce,
      await hashSecret(verifier),
      now + 300000,
      ownerLink ? 1 : 0,
    )
    .run();
  return { id, nonce };
}
export async function consumeChallenge(
  DB: D1Database,
  id: string,
  verifier: string,
) {
  const row = await DB.prepare(
    "DELETE FROM login_challenges WHERE id=? AND verifier_hash=? AND expires_at>? RETURNING nonce,owner_link",
  )
    .bind(id, await hashSecret(verifier), Date.now())
    .first<{ nonce: string; owner_link: number }>();
  if (!row) throw new ApiError("登录请求已过期或已使用，请重新点击登录。", 401);
  return row;
}
export async function finishGoogleLogin(
  DB: D1Database,
  clientId: string,
  input: unknown,
) {
  const value = z
    .object({
      challengeId: z.string().uuid(),
      verifier: z.string().regex(/^[a-f0-9]{64}$/),
      credential: z.string().max(16000),
      name: z.string().trim().min(1).max(80),
    })
    .parse(input);
  const challenge = await consumeChallenge(
    DB,
    value.challengeId,
    value.verifier,
  );
  let identity: GoogleIdentity;
  try {
    identity = await verifyGoogleToken(
      value.credential,
      clientId,
      challenge.nonce,
    );
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError("Google 登录验证失败，请重试。", 401);
  }
  const account = await acceptIdentity(DB, identity, !!challenge.owner_link);
  const id = crypto.randomUUID();
  const device = await registerDevice(
    privateDatabase(DB, account.seat, account.id),
    { owner: true },
    { id, name: value.name },
  );
  const expiresAt = Date.now() + 30 * 86400000;
  await DB.prepare(
    "INSERT INTO login_sessions(token_hash,account_id,device_id,expires_at) VALUES(?,?,?,?)",
  )
    .bind(await hashSecret(device.token!), account.id, id, expiresAt)
    .run();
  return {
    ...device,
    expiresAt,
    user: {
      id: account.id,
      email: account.email,
      name: account.name,
      role: account.seat === 1 ? "admin" : "member",
    },
  };
}
