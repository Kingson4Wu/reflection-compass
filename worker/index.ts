import { testPushMessage, scheduledPushMessage } from "./push-language";
import { privateDatabase, type PrivateDatabase } from "./tenancy";
import { createChallenge, finishGoogleLogin } from "./google-auth";
import { listMembers, inviteMember, removeMember } from "./members";
import {
  buildPushPayload,
  type PushSubscription,
} from "@block65/webcrypto-web-push";
import { z } from "zod";
import { stateSchema, dueSlots, emptyState, isQuiet } from "../src/domain";
import { corsBoundary } from "./cors";
import { authenticate } from "./auth";
import { ApiError } from "./errors";
import { synchronizeRecords } from "./sync";
import { commitProjection } from "./projection";
import {
  listDevices,
  registerDevice,
  selectTarget,
  saveSubscription,
  updateSubscriptionLocale,
  removeSubscription,
  invalidateSubscription,
  removeDevice,
} from "./devices";
import {
  ensureDailyBackup,
  listBackups,
  manualBackup,
  downloadBackup,
  restoreBackup,
} from "./backups";
interface Env {
  DB: D1Database;
  ASSETS?: Fetcher;
  ALLOWED_ORIGINS?: string;
  OWNER_TOKEN: string;
  GOOGLE_CLIENT_ID?: string;
  VAPID_PUBLIC_KEY: string;
  VAPID_PRIVATE_KEY: string;
  VAPID_SUBJECT: string;
}
const json = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
const localeSchema = z.enum(["zh-CN", "en"]);
const subscriptionSchema = z.object({
  locale: localeSchema.optional(),
  endpoint: z
    .string()
    .url()
    .refine((v) => {
      const u = new URL(v);
      return (
        u.protocol === "https:" &&
        !u.username &&
        !u.password &&
        (!u.port || u.port === "443") &&
        (u.hostname === "fcm.googleapis.com" ||
          u.hostname === "updates.push.services.mozilla.com" ||
          u.hostname.endsWith(".push.apple.com") ||
          u.hostname === "web.push.apple.com" ||
          u.hostname === "wns2-bl2p.notify.windows.com" ||
          u.hostname.endsWith(".notify.windows.com"))
      );
    }),
  expirationTime: z.number().nullable().optional(),
  keys: z.object({
    p256dh: z.string().regex(/^[A-Za-z0-9_-]{87}$/),
    auth: z.string().regex(/^[A-Za-z0-9_-]{22}$/),
  }),
});
async function send(
  env: Pick<Env, "VAPID_PUBLIC_KEY" | "VAPID_PRIVATE_KEY" | "VAPID_SUBJECT">,
  subscription: PushSubscription,
  data: unknown,
  ttl: number,
) {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY || !env.VAPID_SUBJECT)
    throw new Error("通知密钥尚未配置");
  const payload = await buildPushPayload(
    { data: JSON.stringify(data), options: { ttl } },
    subscription,
    {
      subject: env.VAPID_SUBJECT,
      publicKey: env.VAPID_PUBLIC_KEY,
      privateKey: env.VAPID_PRIVATE_KEY,
    },
  );
  return fetch(subscription.endpoint, {
    ...payload,
    redirect: "manual",
    signal: AbortSignal.timeout(15000),
  });
}
export async function handleRequest(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  if (!url.pathname.startsWith("/api/"))
    return env.ASSETS
      ? env.ASSETS.fetch(req)
      : json({ error: "API only" }, 404);
  const boundary = corsBoundary(req, env.ALLOWED_ORIGINS);
  if (boundary.response) return boundary.response;
  try {
    return boundary.finish(await handleApi(req, env));
  } catch (error) {
    if (error instanceof ApiError)
      return boundary.finish(json({ error: error.message }, error.status));
    if (error instanceof z.ZodError || error instanceof SyntaxError)
      return boundary.finish(json({ error: "请求格式不正确。" }, 400));
    console.error("request failed");
    return boundary.finish(
      json({ error: "服务暂时不可用，请稍后重试。" }, 503),
    );
  }
}
async function readSmallBody(req: Request, allowEmpty = false) {
  if (Number(req.headers.get("Content-Length") ?? 0) > 20000)
    throw new ApiError("请求过大。", 413);
  const reader = req.body?.getReader();
  if (!reader) {
    if (allowEmpty) return {};
    throw new ApiError("缺少请求内容。");
  }
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 20000) {
      await reader.cancel();
      throw new ApiError("请求过大。", 413);
    }
    chunks.push(value);
  }
  if (allowEmpty && size === 0) return {};
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}
async function handleApi(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  if (url.pathname === "/api/health") return json({ ok: true });
  if (url.pathname === "/api/auth/config" && req.method === "GET")
    return json({
      clientId: env.GOOGLE_CLIENT_ID ?? "",
      configured: !!env.GOOGLE_CLIENT_ID,
    });
  if (url.pathname === "/api/auth/challenge" && req.method === "POST") {
    if (!env.GOOGLE_CLIENT_ID)
      throw new ApiError("Google 登录尚未配置，请联系管理员。", 503);
    const input = z
      .object({
        verifier: z.string().max(64),
        linkOwner: z.boolean().default(false),
      })
      .parse(await readSmallBody(req));
    if (input.linkOwner) {
      const owner = await authenticate(req, env);
      if (!owner?.admin)
        throw new ApiError(
          "请先通过管理员恢复入口连接，再绑定 Google 账号。",
          403,
        );
    }
    return json(
      await createChallenge(
        env.DB,
        input.verifier,
        input.linkOwner,
        (req.headers.get("CF-Connecting-IP") ?? "local") + env.OWNER_TOKEN,
      ),
    );
  }
  if (url.pathname === "/api/auth/google" && req.method === "POST") {
    if (!env.GOOGLE_CLIENT_ID) throw new ApiError("Google 登录尚未配置。", 503);
    return json(
      await finishGoogleLogin(
        env.DB,
        env.GOOGLE_CLIENT_ID,
        await readSmallBody(req),
      ),
    );
  }
  const auth = await authenticate(req, env);
  if (!auth)
    return json(
      {
        error: req.headers.get("Authorization")?.startsWith("Bearer dv_")
          ? "登录已过期或设备授权已撤销，请重新使用 Google 登录。"
          : "请输入正确的个人访问密钥。",
      },
      401,
    );
  const rootDB = env.DB;
  if (url.pathname === "/api/me" && req.method === "GET") {
    const account = await rootDB
      .prepare("SELECT id,email,name FROM accounts WHERE id=?")
      .bind(auth.accountId ?? "owner")
      .first();
    return json({
      user: account,
      role: auth.admin ? "admin" : "member",
      deviceId: auth.deviceId,
    });
  }
  if (
    url.pathname === "/api/members" ||
    url.pathname.startsWith("/api/members/")
  ) {
    if (!auth.admin) throw new ApiError("仅管理员可以管理成员。", 403);
    if (req.method === "GET") return json(await listMembers(rootDB));
    if (req.method === "POST" && url.pathname === "/api/members") {
      const input = z
        .object({ email: z.email().max(254) })
        .parse(await readSmallBody(req));
      return json(await inviteMember(rootDB, input.email));
    }
    if (req.method === "DELETE") {
      await removeMember(
        rootDB,
        decodeURIComponent(url.pathname.slice("/api/members/".length)),
      );
      return json({ ok: true });
    }
    return json({ error: "接口不存在。" }, 404);
  }
  const DB = privateDatabase(rootDB, auth.seat ?? 1, auth.accountId ?? "owner");
  try {
    if (Number(req.headers.get("Content-Length") ?? 0) > 2000000)
      return json({ error: "数据超过 2 MB，请先导出历史记录。" }, 413);
    const read = async () => {
      const raw = await req.text();
      if (new TextEncoder().encode(raw).length > 2000000)
        throw new Error("数据超过 2 MB");
      return JSON.parse(raw);
    };
    if (url.pathname === "/api/sync" && req.method === "POST")
      return json(await synchronizeRecords(DB, await read()));
    if (url.pathname === "/api/devices" && req.method === "GET")
      return json(await listDevices(DB, auth.deviceId));
    if (url.pathname === "/api/devices" && req.method === "POST")
      return json(await registerDevice(DB, auth, await read()));
    if (url.pathname === "/api/devices/target" && req.method === "POST") {
      const input = z.object({ id: z.string().max(100) }).parse(await read());
      await selectTarget(DB, input.id);
      return json({ ok: true });
    }
    if (url.pathname.startsWith("/api/devices/") && req.method === "DELETE") {
      await removeDevice(
        DB,
        decodeURIComponent(url.pathname.slice("/api/devices/".length)),
      );
      return json({ ok: true });
    }
    if (url.pathname === "/api/backups" && req.method === "GET")
      return json(await listBackups(DB));
    if (url.pathname === "/api/backups" && req.method === "POST")
      return json(await manualBackup(DB));
    if (url.pathname.startsWith("/api/backups/")) {
      const suffix = url.pathname.slice("/api/backups/".length);
      if (req.method === "POST" && suffix.endsWith("/restore")) {
        const input = z
          .object({ revision: z.number().int().nonnegative() })
          .parse(await read());
        return json(
          await restoreBackup(
            DB,
            decodeURIComponent(suffix.slice(0, -8)),
            input.revision,
          ),
        );
      }
      if (req.method === "GET")
        return json(await downloadBackup(DB, decodeURIComponent(suffix)));
    }
    if (url.pathname === "/api/state" && req.method === "GET") {
      const row = await DB.prepare(
        "SELECT revision,body FROM state WHERE id=1",
      ).first<{ revision: number; body: string }>();
      return json({
        revision: row?.revision ?? 0,
        state: row ? JSON.parse(row.body) : emptyState(),
      });
    }
    if (url.pathname === "/api/state" && req.method === "PUT") {
      const input = z
        .object({
          revision: z.number().int().nonnegative(),
          state: stateSchema,
        })
        .parse(await read());
      const current = await DB.prepare(
        "SELECT revision,body FROM state WHERE id=1",
      ).first<{ revision: number; body: string }>();
      if ((current?.revision ?? 0) !== input.revision)
        return json({ error: "云端已有其他修改，请选择保留哪个版本。" }, 409);
      const old = current
        ? stateSchema.parse(JSON.parse(current.body))
        : emptyState();
      const revision = await commitProjection(
        DB,
        input.revision,
        old,
        input.state,
      );
      if (revision === null) return json({ error: "云端版本已变更。" }, 409);
      return json({ revision });
    }
    if (url.pathname === "/api/config" && req.method === "GET")
      return json({
        publicKey: env.VAPID_PUBLIC_KEY ?? "",
        pushReady: !!(
          env.VAPID_PUBLIC_KEY &&
          env.VAPID_PRIVATE_KEY &&
          env.VAPID_SUBJECT
        ),
        subscribed: !!(await DB.prepare(
          "SELECT id FROM subscription WHERE id=1",
        ).first()),
      });
    if (url.pathname === "/api/subscription" && req.method === "POST") {
      const value = subscriptionSchema.parse(await read());
      for (let seat = 1; seat <= 5; seat++) {
        if (seat === (auth.seat ?? 1)) continue;
        const other = privateDatabase(rootDB, seat);
        const occupied = await other
          .prepare(
            "SELECT id FROM devices WHERE json_extract(subscription,'$.endpoint')=? UNION ALL SELECT 'legacy' FROM subscription WHERE json_extract(body,'$.endpoint')=? LIMIT 1",
          )
          .bind(value.endpoint, value.endpoint)
          .first();
        if (occupied)
          throw new ApiError(
            "这个浏览器的通知已关联其他账号。请先在原账号关闭通知，或使用独立浏览器/设备。",
            409,
          );
      }
      const result = await saveSubscription(DB, auth, JSON.stringify(value));
      return json({ ok: true, ...result });
    }
    if (url.pathname === "/api/subscription" && req.method === "PATCH") {
      const { locale } = z
        .object({ locale: localeSchema })
        .strict()
        .parse(await readSmallBody(req));
      return json({
        ok: true,
        ...(await updateSubscriptionLocale(DB, auth, locale)),
      });
    }
    if (url.pathname === "/api/subscription" && req.method === "DELETE") {
      await removeSubscription(DB, auth);
      return json({ ok: true });
    }
    if (url.pathname === "/api/push/test" && req.method === "POST") {
      const input = z
        .object({ currentDevice: z.boolean().optional() })
        .parse(await readSmallBody(req, true));
      if (input.currentDevice && !auth.deviceId)
        return json({ error: "请先连接当前设备，再测试通知。" }, 400);
      const row =
        input.currentDevice && auth.deviceId
          ? await DB.prepare(
              "SELECT subscription AS body FROM devices WHERE id=? AND subscription IS NOT NULL",
            )
              .bind(auth.deviceId)
              .first<{ body: string }>()
          : await DB.prepare("SELECT body FROM subscription WHERE id=1").first<{
              body: string;
            }>();
      if (!row) return json({ error: "请先在这台设备开启通知。" }, 400);
      let response: Response;
      try {
        response = await send(
          env,
          JSON.parse(row.body),
          testPushMessage(JSON.parse(row.body).locale),
          60,
        );
      } catch (error) {
        let reason =
          error instanceof Error
            ? `${error.name}: ${error.message}`
            : "Unknown error";
        for (const value of [
          env.OWNER_TOKEN,
          env.VAPID_PRIVATE_KEY,
          JSON.parse(row.body).endpoint,
        ])
          if (value) reason = reason.split(value).join("[redacted]");
        return json(
          { code: "PUSH_TEST_FAILED", error: `测试推送失败：${reason}` },
          502,
        );
      }
      if (response.status === 404 || response.status === 410)
        await invalidateSubscription(DB, row.body);
      return response.ok
        ? json({ accepted: true })
        : json(
            {
              error: `推送服务返回 ${response.status}，请重新订阅或检查密钥。`,
            },
            502,
          );
    }
    if (url.pathname === "/api/deliveries" && req.method === "GET") {
      const rows = await DB.prepare(
        "SELECT id,status,attempts,last_error FROM deliveries ORDER BY expires DESC LIMIT 30",
      ).all();
      return json(rows.results);
    }
    if (url.pathname === "/api/data" && req.method === "DELETE") {
      await DB.batch([
        DB.prepare("DELETE FROM state"),
        DB.prepare("DELETE FROM subscription"),
        DB.prepare("DELETE FROM deliveries"),
        ...[
          "sync_records",
          "sync_operations",
          "sync_guard",
          "devices",
          "notification_target",
          "backups",
        ].map((table) => DB.prepare(`DELETE FROM ${table}`)),
      ]);
      await rootDB
        .prepare("DELETE FROM login_sessions WHERE account_id=?")
        .bind(auth.accountId ?? "owner")
        .run();
      return json({ ok: true });
    }
    return json({ error: "接口不存在。" }, 404);
  } catch (error) {
    if (error instanceof ApiError)
      return json({ error: error.message }, error.status);
    if (error instanceof z.ZodError || error instanceof SyntaxError)
      return json(
        { error: "数据格式不正确，请检查时间、日期和输入长度。" },
        400,
      );
    console.error(
      "api failure",
      error instanceof Error ? error.message : "unknown",
    );
    return json({ error: "服务暂时不可用，本地修改已保留，请稍后重试。" }, 503);
  }
}
export async function runAllSchedules(env: Env, now = new Date()) {
  const accounts = await env.DB.prepare(
    "SELECT seat,id FROM accounts WHERE status IN ('owner','active')",
  ).all<{ seat: number; id: string }>();
  for (const account of accounts.results) {
    try {
      await runSchedule(
        { ...env, DB: privateDatabase(env.DB, account.seat, account.id) },
        now,
      );
    } catch {
      console.error("account schedule failed", { seat: account.seat });
    }
  }
}
export async function runSchedule(
  env: Omit<Env, "DB"> & { DB: PrivateDatabase },
  now = new Date(),
) {
  await ensureDailyBackup(env.DB, now);
  const epoch = Math.floor(now.getTime() / 1000);
  await env.DB.prepare("DELETE FROM deliveries WHERE expires<?")
    .bind(epoch - 30 * 86400)
    .run();
  const current = await env.DB.prepare(
    "SELECT revision,body FROM state WHERE id=1",
  ).first<{ revision: number; body: string }>();
  if (!current) return;
  const state = stateSchema.parse(JSON.parse(current.body));
  const localTime = new Intl.DateTimeFormat("en-GB", {
    timeZone: state.settings.timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(now);
  if (
    state.settings.paused ||
    isQuiet(localTime, state.settings.quietStart, state.settings.quietEnd)
  )
    return;
  const subscription = await env.DB.prepare(
    "SELECT body FROM subscription WHERE id=1",
  ).first<{ body: string }>();
  if (!subscription) return;
  for (const slot of dueSlots(state, now))
    await env.DB.prepare(
      "INSERT OR IGNORE INTO deliveries(id,day,question,expires,available) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM state WHERE id=1 AND revision=?)",
    )
      .bind(
        slot.id,
        slot.day,
        slot.question,
        epoch + 300,
        epoch,
        current.revision,
      )
      .run();
  await env.DB.prepare(
    "UPDATE deliveries SET status='expired' WHERE expires<=? AND status IN ('pending','retry','processing')",
  )
    .bind(epoch)
    .run();
  const lease = crypto.randomUUID();
  const claimed = await env.DB.prepare(
    "UPDATE deliveries SET status='processing',lease=?,available=?,attempts=attempts+1 WHERE id IN (SELECT id FROM deliveries WHERE ((status IN ('pending','retry') AND available<=?) OR (status='processing' AND available<=?)) AND expires>? AND attempts<3 LIMIT 6) RETURNING *",
  )
    .bind(lease, epoch + 60, epoch, epoch, epoch)
    .all<{
      id: string;
      day: string;
      question: string;
      expires: number;
      attempts: number;
    }>();
  for (const task of claimed.results) {
    const active = await env.DB.prepare(
      "SELECT body FROM subscription WHERE id=1 AND json_extract(body,'$.endpoint')=json_extract(?,'$.endpoint') AND json_extract(body,'$.keys.p256dh')=json_extract(?,'$.keys.p256dh') AND json_extract(body,'$.keys.auth')=json_extract(?,'$.keys.auth') AND EXISTS(SELECT 1 FROM deliveries WHERE id=? AND lease=? AND status='processing') AND EXISTS(SELECT 1 FROM state WHERE id=1 AND revision=?)",
    )
      .bind(
        subscription.body,
        subscription.body,
        subscription.body,
        task.id,
        lease,
        current.revision,
      )
      .first<{ body: string }>();
    if (!active) {
      await env.DB.prepare(
        "UPDATE deliveries SET status='cancelled' WHERE id=? AND lease=?",
      )
        .bind(task.id, lease)
        .run();
      continue;
    }
    let status = "retry",
      error: string | null = null;
    try {
      const response = await send(
        env,
        JSON.parse(active.body),
        scheduledPushMessage(JSON.parse(active.body).locale, task),
        Math.max(0, task.expires - Math.floor(Date.now() / 1000)),
      );
      if (response.ok) status = "accepted";
      else {
        error = `HTTP ${response.status}`;
        if ([404, 410].includes(response.status)) {
          await invalidateSubscription(env.DB, active.body);
          status = "failed";
        } else if (response.status < 500 && response.status !== 429)
          status = "failed";
      }
    } catch {
      error = "网络请求失败";
    }
    if (status === "retry" && task.attempts >= 3) status = "failed";
    await env.DB.prepare(
      "UPDATE deliveries SET status=?,last_error=?,available=? WHERE id=? AND lease=? AND status='processing'",
    )
      .bind(status, error, epoch + 60 * task.attempts, task.id, lease)
      .run();
  }
}
export default {
  fetch: handleRequest,
  scheduled: (_event: ScheduledEvent, env: Env, ctx: ExecutionContext) =>
    ctx.waitUntil(runAllSchedules(env)),
};
