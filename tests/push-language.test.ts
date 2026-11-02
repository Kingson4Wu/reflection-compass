import { it, expect } from "vitest";
import { database } from "./helpers/database";
import { updateSubscriptionLocale } from "../worker/devices";
import { testPushMessage, scheduledPushMessage } from "../worker/push-language";
import { privateDatabase } from "../worker/tenancy";
import { QUESTIONS } from "../src/domain";
const original = JSON.stringify({
  endpoint: "https://web.push.apple.com/test",
  keys: { auth: "a", p256dh: "b" },
});
for (const target of ["device-one", "device-two"])
  it(`updates only the current device locale with target ${target}`, async () => {
    const DB = await database();
    for (const id of ["device-one", "device-two"])
      await DB.prepare(
        "INSERT INTO devices(id,name,token_hash,last_seen,subscription) VALUES(?,?,?,?,?)",
      )
        .bind(id, id, id, 1, original)
        .run();
    await DB.prepare("INSERT INTO subscription VALUES(1,?)")
      .bind(original)
      .run();
    await DB.prepare("INSERT INTO notification_target VALUES(1,?)")
      .bind(target)
      .run();
    await DB.prepare(
      "INSERT INTO deliveries(id,day,question,expires,available) VALUES('pending','2026-01-01','question',9999999999,1)",
    ).run();
    expect(
      await updateSubscriptionLocale(
        DB,
        { owner: false, deviceId: "device-one" },
        "en",
      ),
    ).toEqual({ updated: true });
    expect(
      JSON.parse(
        (await DB.prepare("SELECT subscription FROM devices WHERE id=?")
          .bind("device-one")
          .first<{ subscription: string }>())!.subscription,
      ),
    ).toEqual({ ...JSON.parse(original), locale: "en" });
    expect(
      (await DB.prepare("SELECT subscription FROM devices WHERE id=?")
        .bind("device-two")
        .first())!.subscription,
    ).toBe(original);
    const selected = (await DB.prepare("SELECT body FROM subscription").first<{
      body: string;
    }>())!.body;
    expect(JSON.parse(selected)).toEqual(
      target === "device-one"
        ? { ...JSON.parse(original), locale: "en" }
        : JSON.parse(original),
    );
    expect(
      (await DB.prepare("SELECT device_id FROM notification_target").first())!
        .device_id,
    ).toBe(target);
    expect(
      (await DB.prepare("SELECT status FROM deliveries").first())!.status,
    ).toBe("pending");
  });
it("does not create a missing device subscription or let master auth change a real target", async () => {
  const DB = await database();
  expect(
    await updateSubscriptionLocale(
      DB,
      { owner: false, deviceId: "missing" },
      "en",
    ),
  ).toEqual({ updated: false });
  expect(await updateSubscriptionLocale(DB, { owner: true }, "en")).toEqual({
    updated: false,
  });
  await DB.prepare("INSERT INTO subscription VALUES(1,?)").bind(original).run();
  await DB.prepare(
    "INSERT INTO notification_target VALUES(1,'device-other')",
  ).run();
  expect(await updateSubscriptionLocale(DB, { owner: true }, "en")).toEqual({
    updated: false,
  });
  expect(
    (await DB.prepare("SELECT body FROM subscription").first())!.body,
  ).toBe(original);
  await DB.prepare("DELETE FROM notification_target").run();
  expect(await updateSubscriptionLocale(DB, { owner: true }, "en")).toEqual({
    updated: true,
  });
});
it("keeps locale changes in the tenant partition", async () => {
  const DB = await database();
  await DB.prepare("INSERT INTO subscription VALUES(1,?)").bind(original).run();
  const member = privateDatabase(DB, 2);
  await member
    .prepare("INSERT INTO subscription VALUES(1,?)")
    .bind(original)
    .run();
  await updateSubscriptionLocale(member, { owner: true }, "en");
  expect(
    (await DB.prepare("SELECT body FROM subscription").first())!.body,
  ).toBe(original);
  expect(
    JSON.parse(
      (await member
        .prepare("SELECT body FROM subscription")
        .first<{ body: string }>())!.body,
    ).locale,
  ).toBe("en");
});
it("localizes push copy and known questions while preserving custom questions and legacy Chinese", () => {
  expect(testPushMessage("en")).toMatchObject({
    lang: "en",
    body: "A test reminder from Reflection Compass.",
  });
  expect(testPushMessage(undefined)).toMatchObject({
    lang: "zh-CN",
    title: "Reflection Compass · 测试提醒",
    body: "推送链路已接受请求，打开应用开始一次反思。",
  });
  const task = { id: "slot", day: "2026-01-01", question: QUESTIONS[0] };
  const english = scheduledPushMessage("en", task);
  expect(english.title).toBe("Take a moment for yourself");
  expect(
    new URL(english.url, "https://app.test").searchParams.get("question"),
  ).not.toBe(QUESTIONS[0]);
  expect(
    new URL(
      scheduledPushMessage("en", { ...task, question: "我的问题" }).url,
      "https://app.test",
    ).searchParams.get("question"),
  ).toBe("我的问题");
  expect(scheduledPushMessage(undefined, task)).toMatchObject({
    title: "给自己一次停顿",
    body: "看看此刻的行动，是否靠近你想去的方向。",
    lang: "zh-CN",
  });
});

import { handleRequest } from "../worker/index";
const ownerToken = "o".repeat(48);
async function api(DB: D1Database, method: string, body: unknown) {
  return handleRequest(
    new Request("https://compass.test/api/subscription", {
      method,
      headers: { Authorization: "Bearer " + ownerToken },
      body: JSON.stringify(body),
    }),
    {
      DB,
      OWNER_TOKEN: ownerToken,
      VAPID_PUBLIC_KEY: "",
      VAPID_PRIVATE_KEY: "",
      VAPID_SUBJECT: "",
    },
  );
}
it("validates PATCH locale and requires authentication", async () => {
  const DB = await database();
  for (const body of [
    { locale: "fr" },
    {},
    { locale: "en", endpoint: "changed" },
  ])
    expect((await api(DB, "PATCH", body)).status).toBe(400);
  expect(
    (
      await handleRequest(
        new Request("https://compass.test/api/subscription", {
          method: "PATCH",
          body: '{"locale":"en"}',
        }),
        {
          DB,
          OWNER_TOKEN: ownerToken,
          VAPID_PUBLIC_KEY: "",
          VAPID_PRIVATE_KEY: "",
          VAPID_SUBJECT: "",
        },
      )
    ).status,
  ).toBe(401);
  expect(await (await api(DB, "PATCH", { locale: "en" })).json()).toEqual({
    ok: true,
    updated: false,
  });
});
it("persists optional POST locale and rejects unsupported locales", async () => {
  const DB = await database();
  const subscription = {
    endpoint: "https://web.push.apple.com/test",
    keys: { p256dh: "a".repeat(87), auth: "a".repeat(22) },
  };
  expect(
    (await api(DB, "POST", { ...subscription, locale: "fr" })).status,
  ).toBe(400);
  expect(
    (await api(DB, "POST", { ...subscription, locale: "en" })).status,
  ).toBe(200);
  expect(
    JSON.parse(
      (await DB.prepare("SELECT body FROM subscription").first<{
        body: string;
      }>())!.body,
    ),
  ).toEqual({ ...subscription, locale: "en" });
  expect((await api(DB, "POST", subscription)).status).toBe(200);
  expect(
    JSON.parse(
      (await DB.prepare("SELECT body FROM subscription").first<{
        body: string;
      }>())!.body,
    ),
  ).toEqual(subscription);
});

import { vi, afterEach } from "vitest";
import { runSchedule } from "../worker/index";
import { emptyState } from "../src/domain";
import { buildPushPayload } from "@block65/webcrypto-web-push";
vi.mock("@block65/webcrypto-web-push", () => ({
  buildPushPayload: vi.fn(async () => ({ method: "POST" })),
}));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
for (const locale of [undefined, "en"])
  it(`sends selected ${locale ?? "legacy"} locale in test and scheduled payloads`, async () => {
    const DB = await database();
    const subscription = {
      ...JSON.parse(original),
      ...(locale ? { locale } : {}),
    };
    await DB.prepare("INSERT INTO subscription VALUES(1,?)")
      .bind(JSON.stringify(subscription))
      .run();
    const env = {
      DB,
      OWNER_TOKEN: ownerToken,
      VAPID_PUBLIC_KEY: "public",
      VAPID_PRIVATE_KEY: "private",
      VAPID_SUBJECT: "https://app.test",
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 201 })),
    );
    const response = await handleRequest(
      new Request("https://compass.test/api/push/test", {
        method: "POST",
        headers: { Authorization: "Bearer " + ownerToken },
      }),
      env,
    );
    expect(response.status).toBe(200);
    expect(
      JSON.parse(vi.mocked(buildPushPayload).mock.calls[0][0].data as string),
    ).toEqual(testPushMessage(locale));
    const state = emptyState();
    state.settings.paused = false;
    state.settings.slots = ["11:00"];
    await DB.prepare("INSERT INTO state VALUES(1,1,?)")
      .bind(JSON.stringify(state))
      .run();
    await runSchedule(env, new Date("2026-11-02T02:00:00Z"));
    expect(buildPushPayload).toHaveBeenCalledTimes(2);
    const task = await DB.prepare(
      "SELECT id,day,question FROM deliveries",
    ).first<{ id: string; day: string; question: string }>();
    expect(
      JSON.parse(vi.mocked(buildPushPayload).mock.calls[1][0].data as string),
    ).toEqual(scheduledPushMessage(locale, task!));
  });

for (const scenario of ["locale", "target", "expired"] as const)
  it(`handles concurrent ${scenario} changes after claiming a reminder`, async () => {
    const DB = await database();
    await DB.prepare("INSERT INTO subscription VALUES(1,?)")
      .bind(original)
      .run();
    const state = emptyState();
    state.settings.paused = false;
    state.settings.slots = ["11:00"];
    await DB.prepare("INSERT INTO state VALUES(1,1,?)")
      .bind(JSON.stringify(state))
      .run();
    let patched = false;
    const wrap = (statement: D1PreparedStatement): D1PreparedStatement =>
      new Proxy(statement, {
        get(target, key) {
          if (key === "bind")
            return (...args: unknown[]) => wrap(target.bind(...args));
          if (key === "first")
            return async () => {
              patched = true;
              await updateSubscriptionLocale(DB, { owner: true }, "en");
              if (scenario === "target")
                await DB.prepare("UPDATE subscription SET body=?")
                  .bind(
                    JSON.stringify({
                      ...JSON.parse(original),
                      endpoint: "https://web.push.apple.com/other",
                    }),
                  )
                  .run();
              return target.first();
            };
          const value = Reflect.get(target, key);
          return typeof value === "function" ? value.bind(target) : value;
        },
      });
    const guarded = {
      prepare(sql: string) {
        const statement = DB.prepare(sql);
        return sql.includes("lease=?") && sql.includes("revision=?")
          ? wrap(statement)
          : statement;
      },
      batch: DB.batch.bind(DB),
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        if (scenario === "expired")
          await updateSubscriptionLocale(DB, { owner: true }, "zh-CN");
        return new Response(null, {
          status: scenario === "expired" ? 410 : 201,
        });
      }),
    );
    await runSchedule(
      {
        DB: guarded,
        OWNER_TOKEN: ownerToken,
        VAPID_PUBLIC_KEY: "public",
        VAPID_PRIVATE_KEY: "private",
        VAPID_SUBJECT: "https://app.test",
      },
      new Date("2026-11-02T02:00:00Z"),
    );
    expect(patched).toBe(true);
    expect(buildPushPayload).toHaveBeenCalledTimes(
      scenario === "target" ? 0 : 1,
    );
    if (scenario !== "target")
      expect(
        JSON.parse(vi.mocked(buildPushPayload).mock.calls[0][0].data as string)
          .lang,
      ).toBe("en");
    expect(
      (await DB.prepare("SELECT status FROM deliveries").first())!.status,
    ).toBe(
      scenario === "target"
        ? "cancelled"
        : scenario === "expired"
          ? "failed"
          : "accepted",
    );
    if (scenario === "expired")
      expect(
        await DB.prepare("SELECT body FROM subscription").first(),
      ).toBeNull();
  });
