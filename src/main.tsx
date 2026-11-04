import { t, intlLocale, getLanguage, productName } from "./i18n";
import { EditableRow } from "./EditableRow";
import { Today } from "./Today";
import { Pause } from "./Pause";
import { WeeklyNote } from "./WeeklyNote";
import { Continuation } from "./Continuation";
import { adoptAction, adoptionMessage, continuation } from "./support";
import { useConfirm, ConfirmationProvider } from "./Confirmation";
import { Icon } from "./Icon";
import { useAppFrame } from "./use-app-frame";
import { GoogleLogin } from "./GoogleLogin";
import { MemberSettings } from "./MemberSettings";
import { appPath } from "./deployment";
import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  emptyDay,
  emptyState,
  localDay,
  QUESTIONS,
  type State,
  type Day,
} from "./domain";
import { api, request } from "./store";
import { useNotificationLanguage } from "./use-notification-language";
import { useLanguage } from "./use-language";
import { LanguageSettings } from "./LanguageSettings";
import { questionText } from "./language";
import { useCompass } from "./use-compass";
import { ConflictPanel } from "./ConflictPanel";
import { DeviceSettings, BackupSettings } from "./SyncSettings";
import "./style.css";
import "./app-shell.css";
import "./native-ui.css";
type View = "today" | "direction" | "reflect" | "review" | "settings";
const NAV: [View, string][] = [
  ["today", "今天"],
  ["direction", "方向"],
  ["reflect", "停顿"],
  ["review", "回顾"],
  ["settings", "设置"],
];
const PRIMARY_NAV = NAV.filter(([id]) =>
  ["today", "direction", "review"].includes(id),
);
const labels: Record<keyof State["direction"], string> = {
  vision: "我想过怎样的生活",
  antiVision: "我不想继续的生活（可选）",
  identity: "我正在成为怎样的人",
  goal: "一年后，希望看到的一个变化",
  project: "这个月，推进的一个项目",
  constraints: "我不愿牺牲的事",
};
function App() {
  const language = useLanguage();
  const confirm = useConfirm();
  const [, setClock] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setClock((n) => n + 1), 30000);
    return () => clearInterval(interval);
  }, []);
  const compass = useCompass();
  const {
    snapshot,
    accountId,
    user,
    googleConnected,
    change,
    sync,
    syncing,
    busy,
    setBusy,
    status,
    message,
    setMessage,
    storageError,
    token,
    tokenInput,
    setTokenInput,
    deviceId,
    deviceName,
    setDeviceName,
    remember,
    setRemember,
    connect,
    logout,
    resolve,
    importState,
    rename,
    restoreCloud,
    eraseAll,
  } = compass;
  const notificationLanguage = useNotificationLanguage(token, language);
  const [view, setViewState] = useState<View>(() => {
    const v = new URLSearchParams(location.search).get("view");
    return NAV.some((n) => n[0] === v) ? (v as View) : "today";
  });
  const { scrollRef, onScroll, keyboardOpen, scrollToTop } = useAppFrame(
    view,
    accountId,
    !!snapshot,
  );
  function setView(next: View) {
    if (next === view) {
      scrollToTop();
      return;
    }
    if (document.activeElement instanceof HTMLElement)
      document.activeElement.blur();
    const url = new URL(location.href);
    url.searchParams.set("view", next);
    window.history.pushState(null, "", url);
    setViewState(next);
  }
  useEffect(() => {
    const back = () => {
      const next = new URLSearchParams(location.search).get("view");
      setViewState(NAV.some(([id]) => id === next) ? (next as View) : "today");
    };
    window.addEventListener("popstate", back);
    return () => window.removeEventListener("popstate", back);
  }, []);
  useEffect(() => {
    document.documentElement.lang = language;
    document.title = `${t(NAV.find(([id]) => id === view)?.[1])} · ${productName()}`;
    document.querySelector<HTMLLinkElement>('link[rel="manifest"]')!.href =
      appPath(
        language === "en" ? "manifest-en.webmanifest" : "manifest.webmanifest",
      );
  }, [view, language]);
  const [pushFeedback, setPushFeedback] = useState(""),
    [action, setAction] = useState(""),
    [question, setQuestion] = useState(
      () =>
        new URLSearchParams(location.search).get("question")?.slice(0, 10000) ||
        QUESTIONS[0],
    ),
    [answer, setAnswer] = useState(""),
    [next, setNext] = useState(""),
    [history, setHistory] = useState<
      {
        id: string;
        status: string;
        attempts: number;
        last_error: string | null;
      }[]
    >([]);
  const activeAccount = useRef(accountId);
  activeAccount.current = accountId;
  const activeToken = useRef(token);
  activeToken.current = token;
  const pushFeedbackRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setAnswer("");
    setNext("");
    setAction("");
    setHistory([]);
    setPushFeedback("");
    setNeedsTarget(false);
  }, [accountId]);
  useEffect(() => {
    if (pushFeedback)
      pushFeedbackRef.current?.scrollIntoView({ block: "nearest" });
  }, [pushFeedback]);
  async function perform(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const [deviceRevision, setDeviceRevision] = useState(0);
  const [needsTarget, setNeedsTarget] = useState(false);
  async function testPush() {
    const forToken = token;
    setBusy(true);
    setPushFeedback(t("正在发送测试提醒…"));
    try {
      if (!token) throw new Error(t("请先连接个人云端。"));
      await api("push/test", token, {
        method: "POST",
        body: JSON.stringify({ currentDevice: true }),
      });
      if (activeToken.current !== forToken) return;
      setPushFeedback(
        t(
          "推送服务已接受请求。请检查锁屏或通知中心；这不代表设备已经展示通知。",
        ),
      );
    } catch (error) {
      if (activeToken.current !== forToken) return;
      setPushFeedback(
        error instanceof Error ? error.message : t("测试推送失败，请重试。"),
      );
    } finally {
      setBusy(false);
    }
  }
  async function notifications() {
    const forToken = token;
    if (!token) throw new Error(t("请先连接个人云端。"));
    if (!("PushManager" in window) || !("Notification" in window))
      throw new Error(
        t("此浏览器暂不支持通知。iPhone 请先添加到主屏幕，并从图标打开。"),
      );
    const permission = await Notification.requestPermission();
    if (activeToken.current !== forToken) return;
    if (permission !== "granted")
      throw new Error(t("通知未授权。请在系统设置中允许通知，然后重试。"));
    const config = await api("config", token);
    if (activeToken.current !== forToken) return;
    if (!config.pushReady)
      throw new Error(t("云端尚未配置通知密钥，请按 README 完成设置。"));
    const registration = await navigator.serviceWorker.ready;
    const key = Uint8Array.from(
      atob(
        config.publicKey.replace(/-/g, "+").replace(/_/g, "/") +
          "=".repeat((4 - (config.publicKey.length % 4)) % 4),
      ),
      (c) => c.charCodeAt(0),
    );
    const sub =
      (await registration.pushManager.getSubscription()) ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: key,
      }));
    if (activeToken.current !== forToken) return;
    const subscriptionResult = await api("subscription", token, {
      method: "POST",
      body: JSON.stringify({ ...sub.toJSON(), locale: getLanguage() }),
    });
    if (activeToken.current !== forToken) return;
    setNeedsTarget(!subscriptionResult.target);
    setDeviceRevision((value) => value + 1);
    notificationLanguage.reconcile();
    setPushFeedback(
      subscriptionResult.target
        ? t("当前设备已开启通知并接收提醒。可发送测试确认。")
        : t(
            "此设备已开启通知，日常提醒仍发往之前的订阅。可在下方切换到这台设备。",
          ),
    );
  }
  if (!snapshot)
    return (
      <main className="loading">
        <img
          className="loading-mark"
          src={appPath("icon-192.png")}
          width="64"
          height="64"
          alt=""
        />
        <h1>{productName()}</h1>
        <p role="status">
          {storageError ? t(message) : t("正在打开你的记录…")}
        </p>
      </main>
    );
  const state = snapshot.state,
    today = localDay(new Date(), state.settings.timezone),
    day = state.days[today] ?? emptyDay(),
    requestedDay = new URLSearchParams(location.search).get("day"),
    late = !!requestedDay && requestedDay !== today;
  const updateDay = (edit: (d: Day) => void, date = today) =>
    change((s) => {
      s.days[date] ??= emptyDay();
      edit(s.days[date]);
    });
  const recordedDays = Object.entries(state.days).filter(
    ([, d]) =>
      d.actions.length ||
      d.reflections.length ||
      Object.values(d.evening).some(Boolean),
  );
  function record(adopt = false): string | null {
    if (day.reflections.length >= 100)
      return t("今天的记录已满。可以先回到今天，不必继续填写。");
    const id = crypto.randomUUID();
    let error: string | null = null;
    updateDay((d) => {
      if (adopt) {
        const result = adoptAction(d, id, next);
        if (!["added", "exists"].includes(result)) {
          error = adoptionMessage(result);
          return;
        }
      }
      d.reflections.push({
        id,
        at: new Date().toISOString(),
        question,
        answer,
        next,
        skipped: false,
      });
    });
    if (error) return error;
    setAnswer("");
    setNext("");
    setMessage(
      adopt
        ? t("下一步已放入今天，观察也已记录。")
        : t("已记录。需要时再回来。"),
    );
    setView("today");
    return null;
  }
  return (
    <div className={`app-shell${keyboardOpen ? " keyboard-open" : ""}`}>
      <aside className="sidebar">
        <a
          className="brand"
          href={appPath()}
          aria-label="Reflection Compass home"
        >
          <img
            className="brand-mark"
            src={appPath("icon-192.png")}
            width="44"
            height="44"
            alt=""
          />
          <span>{productName()}</span>
        </a>
        <p className="sidebar-note">
          {t("把想去的方向，")}
          <br />
          {t("变成今天的一小步。")}
        </p>
        <nav aria-label={t("主导航")}>
          {PRIMARY_NAV.map(([id, label]) => (
            <button
              key={id}
              className={view === id ? "active" : ""}
              aria-current={view === id ? "page" : undefined}
              onClick={() => setView(id)}
            >
              <Icon name={id} />
              {t(label)}
            </button>
          ))}
        </nav>
      </aside>
      <main className="app-main">
        <header className="app-header">
          <div>
            <span className="eyebrow">{today.replaceAll("-", " / ")}</span>
            <h1>{t(NAV.find(([id]) => id === view)?.[1])}</h1>
          </div>
          <div className="header-tools">
            {(["reflect", "settings"] as const).map((id) => (
              <button
                key={id}
                className={`header-tool${view === id ? " active" : ""}`}
                aria-label={id === "reflect" ? t("停顿") : t("设置")}
                title={id === "reflect" ? t("停顿") : t("设置")}
                aria-current={view === id ? "page" : undefined}
                onClick={() => setView(id)}
              >
                <Icon name={id} />
                <span>{id === "reflect" ? t("停顿") : t("设置")}</span>
              </button>
            ))}
            <button
              aria-label={t(`同步状态：${t(status)}`)}
              title={t(status)}
              className={`sync${syncing ? " is-syncing" : ""}`}
              disabled={busy || syncing || !token}
              onClick={() => void sync(true)}
            >
              <span className="sync-label">
                {busy ? t("正在处理…") : syncing ? t("正在同步…") : t(status)}
              </span>
              <Icon name="sync" />
            </button>
          </div>
        </header>
        <div
          className="page-scroll"
          ref={scrollRef}
          onScroll={onScroll}
          data-testid="page-scroll"
          role="region"
          aria-label={t(`${t(NAV.find(([id]) => id === view)?.[1])}内容`)}
        >
          {message && (
            <div role="status" className="notice">
              {t(message)}
              <button aria-label={t("关闭提示")} onClick={() => setMessage("")}>
                ×
              </button>
            </div>
          )}
          <ConflictPanel
            conflicts={snapshot.conflicts ?? []}
            onResolve={resolve}
            busy={busy}
          />
          <fieldset
            key={`${accountId ?? "guest"}:${view}`}
            disabled={busy}
            className="workspace page-transition"
            data-view={view}
          >
            {view === "today" && (
              <Today
                input={action}
                setInput={setAction}
                state={state}
                today={today}
                status={t(status)}
                updateDay={updateDay}
                onDirection={() => setView("direction")}
                onPause={() => setView("reflect")}
              />
            )}
            {view === "direction" && (
              <>
                <p className="native-caption">
                  {t("需要时再调整，不必一次填满。")}
                </p>
                <section className="card direction-fields native-list">
                  {(
                    [
                      "vision",
                      "goal",
                      "project",
                      "identity",
                      "antiVision",
                      "constraints",
                    ] as (keyof State["direction"])[]
                  ).map((k) => (
                    <EditableRow
                      key={k}
                      status={t(status)}
                      label={t(labels[k])}
                      value={state.direction[k]}
                      onChange={(v) =>
                        change((s) => {
                          s.direction[k] = v;
                        })
                      }
                      placeholder={
                        k === "identity"
                          ? t("我是一个会……的人。")
                          : k === "constraints"
                            ? t("例如：睡眠、与家人的时间、健康。")
                            : undefined
                      }
                    />
                  ))}
                </section>
                <button className="primary" onClick={() => setView("today")}>
                  {t("回到今天，选择行动 ↗")}
                </button>
              </>
            )}
            {view === "reflect" && (
              <Pause
                question={question}
                setQuestion={setQuestion}
                answer={answer}
                setAnswer={setAnswer}
                next={next}
                setNext={setNext}
                late={late}
                onSave={record}
                onLeave={() => setView("today")}
              />
            )}
            {view === "review" && (
              <>
                <p className="native-caption">
                  {t("做过的事和留下的想法，都在这里。")}
                </p>
                <WeeklyNote
                  notes={state.weekly}
                  today={today}
                  status={t(status)}
                  onChange={(key, value) =>
                    change((s) => {
                      s.weekly[key] = value;
                    })
                  }
                />
                <h2 className="history-heading">{t("我的记录")}</h2>
                {recordedDays.length === 0 &&
                  !Object.values(state.weekly).some(Boolean) && (
                    <p className="empty">
                      {t("记录还没开始。今天的一次小行动，就是起点。")}
                    </p>
                  )}
                {recordedDays
                  .sort(([a], [b]) => b.localeCompare(a))
                  .map(([date, d]) => (
                    <section className="card history timeline-entry" key={date}>
                      <h3>{date}</h3>
                      <ul>
                        {d.actions.map((a) => (
                          <li key={a.id}>
                            {a.done ? "✓" : "○"} {a.text}
                          </li>
                        ))}
                      </ul>
                      {d.reflections.map((r) => (
                        <div className="reflection-entry" key={r.id}>
                          <strong>{questionText(r.question, language)}</strong>
                          <p>{r.skipped ? t("本次跳过") : r.answer}</p>
                          {r.next && (
                            <p>
                              {t("下一步：")}
                              {r.next}
                            </p>
                          )}
                          {r.next.trim() && !r.skipped && (
                            <button
                              className="history-adopt"
                              disabled={day.actions.some(
                                (a) =>
                                  a.id === r.id || a.text === r.next.trim(),
                              )}
                              onClick={() => {
                                let result: ReturnType<typeof adoptAction> =
                                  "empty";
                                updateDay((d) => {
                                  result = adoptAction(d, r.id, r.next);
                                });
                                setMessage(adoptionMessage(result));
                              }}
                            >
                              {day.actions.some(
                                (a) =>
                                  a.id === r.id || a.text === r.next.trim(),
                              )
                                ? t("已在今天")
                                : t("用作今天的行动")}
                            </button>
                          )}
                        </div>
                      ))}
                      {d.evening.worked && (
                        <p>
                          {t("有效行动：")}
                          {d.evening.worked}
                        </p>
                      )}
                      {d.evening.obstacle && (
                        <p>
                          {t("障碍：")}
                          {d.evening.obstacle}
                        </p>
                      )}
                      {d.evening.next && (
                        <p>
                          {t("明天调整：")}
                          {d.evening.next}
                        </p>
                      )}
                      {date < today && (
                        <Continuation
                          title={t("从这天继续（可选）")}
                          choices={continuation(state, today, date)}
                          onAdopt={(id, text) => {
                            let result: ReturnType<typeof adoptAction> =
                              "empty";
                            updateDay((d) => {
                              result = adoptAction(d, id, text);
                            });
                            setMessage(adoptionMessage(result));
                          }}
                        />
                      )}
                    </section>
                  ))}
                {Object.entries(state.weekly)
                  .sort(([a], [b]) => b.localeCompare(a))
                  .filter(([, v]) => v)
                  .map(([date, text]) => (
                    <section className="card" key={date}>
                      <h3>
                        {date} {t("· 周回顾")}
                      </h3>
                      <p className="preserve">{text}</p>
                    </section>
                  ))}
              </>
            )}
            {view === "settings" && (
              <>
                <LanguageSettings
                  notificationPending={notificationLanguage.failed}
                />
                <section className="card">
                  <h2>{t("账户与同步")}</h2>
                  <GoogleLogin
                    token={token}
                    name={deviceName}
                    user={user}
                    onConnected={googleConnected}
                    onLogout={logout}
                  />
                  <label className="toggle">
                    <input
                      type="checkbox"
                      checked={remember}
                      onChange={(event) => setRemember(event.target.checked)}
                    />
                    {t("连接后记住此设备")}
                  </label>
                  {(!user || user.role === "admin") && (
                    <details className="recovery-login">
                      <summary>{t("管理员恢复入口")}</summary>
                      <p className="hint">
                        {t(
                          "仅用于首次绑定或恢复管理员访问。日常使用 Google 登录即可。",
                        )}
                      </p>
                      <form onSubmit={connect} className="connect">
                        <label className="field">
                          <span>{t("个人访问密钥")}</span>
                          <input
                            type="password"
                            value={tokenInput}
                            autoComplete="off"
                            onChange={(e) => setTokenInput(e.target.value)}
                          />
                        </label>
                        <button
                          className="primary"
                          disabled={tokenInput.trim().length < 32}
                        >
                          {t("连接并同步")}
                        </button>
                      </form>
                    </details>
                  )}
                  <p className="hint">
                    {snapshot.lastSyncedAt
                      ? t(
                          `上次同步：${new Date(snapshot.lastSyncedAt).toLocaleString(intlLocale())}`,
                        )
                      : t("尚未同步")}{" "}
                    {t("· 待提交")}
                    {snapshot.operations?.length ?? 0}
                    {language === "zh-CN" ? t("项") : ""}
                  </p>
                  <p className="hint">
                    {t("打开应用时自动同步；离线修改会在下次联网打开时上传。")}
                  </p>
                </section>
                <MemberSettings
                  key={"members:" + (accountId ?? "legacy-owner")}
                  token={token}
                />
                <DeviceSettings
                  key={"devices:" + (accountId ?? "legacy-owner")}
                  token={token}
                  refreshKey={deviceRevision}
                  id={deviceId}
                  name={deviceName}
                  setName={setDeviceName}
                  onRename={rename}
                  onLogout={logout}
                />
                <section className="card">
                  <h2>{t("提醒节奏")}</h2>
                  <p className="hint">
                    {t(
                      "提醒只是一次停顿，不需要打开或填写。iPhone 需从主屏幕应用授权通知。",
                    )}
                  </p>
                  <label className="toggle">
                    <input
                      type="checkbox"
                      disabled={!token}
                      checked={!state.settings.paused}
                      onChange={(e) =>
                        change((s) => {
                          s.settings.paused = !e.target.checked;
                        })
                      }
                    />
                    {t("需要时提醒我停顿一下")}
                  </label>
                  <details className="settings-disclosure reminder-timing">
                    <summary>{t("提醒时间与免打扰")}</summary>
                    <p className="hint">
                      {state.settings.slots.join("、")} ·{" "}
                      {state.settings.timezone}
                    </p>
                    <label className="field">
                      <span>{t("提醒时区")}</span>
                      <select
                        value={state.settings.timezone}
                        onChange={(e) =>
                          change((s) => {
                            s.settings.timezone = e.target.value;
                          })
                        }
                      >
                        {Array.from(
                          new Set([
                            state.settings.timezone,
                            "Asia/Tokyo",
                            "Asia/Shanghai",
                            "Asia/Hong_Kong",
                            "Europe/London",
                            "America/New_York",
                            "America/Los_Angeles",
                            "UTC",
                          ]),
                        ).map((t) => (
                          <option key={t}>{t}</option>
                        ))}
                      </select>
                    </label>
                    <div className="slots">
                      {state.settings.slots.map((slot, i) => (
                        <div key={i}>
                          <label>
                            {t("提醒")}
                            {language === "en" ? " " : ""}
                            {i + 1}
                            <input
                              aria-label={t(`提醒 ${i + 1} 时间`)}
                              type="time"
                              value={slot}
                              onChange={(e) => {
                                const v = e.target.value;
                                if (!v) return;
                                if (
                                  state.settings.slots.includes(v) &&
                                  v !== slot
                                ) {
                                  setMessage(t("提醒时间不能重复。"));
                                  return;
                                }
                                change((s) => {
                                  s.settings.slots[i] = v;
                                });
                              }}
                            />
                          </label>
                          <button
                            aria-label={t(`删除提醒 ${i + 1}`)}
                            onClick={() =>
                              change((s) => {
                                s.settings.slots.splice(i, 1);
                              })
                            }
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                    <button
                      disabled={state.settings.slots.length >= 6}
                      onClick={() => {
                        const available = [
                          "09:00",
                          "11:00",
                          "13:30",
                          "15:15",
                          "17:00",
                          "19:30",
                          "21:00",
                        ].find((t) => !state.settings.slots.includes(t));
                        if (available)
                          change((s) => s.settings.slots.push(available));
                      }}
                    >
                      {t("添加提醒时间")}
                    </button>
                    <div className="quiet">
                      {(["quietStart", "quietEnd"] as const).map((k, i) => (
                        <label key={k}>
                          {i === 0 ? t("安静时段开始") : t("安静时段结束")}
                          <input
                            type="time"
                            value={state.settings[k]}
                            onChange={(e) => {
                              if (e.target.value)
                                change((s) => {
                                  s.settings[k] = e.target.value;
                                });
                            }}
                          />
                        </label>
                      ))}
                    </div>
                    <p className="hint">
                      {t(
                        "相同的开始、结束时间表示不设安静时段。通知可能延迟；过期提醒不会持续补发。修改或暂停需同步成功后才在云端生效，已发送的通知无法撤回。",
                      )}
                    </p>
                  </details>
                  <div role="status" aria-live="polite" className="hint">
                    {needsTarget && t("当前设备尚未接收日常提醒。")}
                  </div>
                  {needsTarget && (
                    <button
                      disabled={!token || busy}
                      onClick={() =>
                        void perform(async () => {
                          const forToken = token;
                          await request("devices/target", token, {
                            method: "POST",
                            body: JSON.stringify({ id: deviceId }),
                          });
                          if (activeToken.current !== forToken) return;
                          setNeedsTarget(false);
                          setDeviceRevision((value) => value + 1);
                          setPushFeedback(t("提醒设备已切换。"));
                        })
                      }
                    >
                      {t("将提醒切换到这台设备")}
                    </button>
                  )}
                  {pushFeedback && (
                    <p role="status" className="hint">
                      {t(pushFeedback)}
                    </p>
                  )}
                  {!token && (
                    <p className="hint">
                      {t("请先登录，再开启或测试这台设备的通知。")}
                    </p>
                  )}
                  <div className="buttons">
                    <button
                      disabled={!token || busy}
                      onClick={() => void perform(notifications)}
                    >
                      {t("在这台设备开启通知")}
                    </button>
                    <button
                      disabled={!token}
                      onClick={() =>
                        void perform(async () => {
                          await api("subscription", token, {
                            method: "DELETE",
                          });
                          const sub = await (
                            await navigator.serviceWorker.ready
                          ).pushManager.getSubscription();
                          await sub?.unsubscribe();
                          setNeedsTarget(false);
                          setDeviceRevision((value) => value + 1);
                          setMessage(t("已停止设备推送。"));
                        })
                      }
                    >
                      {t("停止设备推送")}
                    </button>
                  </div>
                </section>
                <details className="card settings-disclosure">
                  <summary>{t("通知诊断")}</summary>
                  {pushFeedback && (
                    <div
                      ref={pushFeedbackRef}
                      data-testid="push-feedback"
                      role="status"
                      aria-live="polite"
                      className="notice"
                    >
                      {t(pushFeedback)}
                    </div>
                  )}

                  <button
                    disabled={!token || busy}
                    onClick={() => void testPush()}
                  >
                    {t("发送测试提醒")}
                  </button>
                  <button
                    disabled={!token}
                    onClick={() =>
                      void perform(async () => {
                        const forAccount = accountId;
                        const result = await api("deliveries", token);
                        if (activeAccount.current === forAccount)
                          setHistory(result);
                      })
                    }
                  >
                    {t("刷新发送记录")}
                  </button>
                  <p className="hint">
                    {t(
                      "测试后请检查锁屏或通知中心。发送成功不代表设备已展示通知。",
                    )}
                  </p>
                  <ul>
                    {history.map((h) => (
                      <li key={h.id}>
                        {(
                          {
                            accepted: t("推送服务已接收"),
                            pending: t("等待发送"),
                            retry: t("等待重试"),
                            processing: t("正在发送"),
                            expired: t("已过期"),
                            cancelled: t("已取消"),
                            failed: t("发送失败"),
                          } as Record<string, string>
                        )[h.status] ?? t("状态待确认")}{" "}
                        {t("· 已尝试")}
                        {h.attempts}
                        {language === "zh-CN" ? t("次") : ""}
                      </li>
                    ))}
                  </ul>
                </details>
                <BackupSettings
                  key={"backups:" + (accountId ?? "legacy-owner")}
                  accountId={accountId}
                  snapshot={snapshot}
                  token={token}
                  onImport={importState}
                  onRestore={restoreCloud}
                  onUndo={importState}
                />
                <details className="card settings-disclosure danger-zone">
                  <summary>{t("删除数据")}</summary>
                  <p className="hint">
                    {t(
                      "删除当前账号的记录、备份及设备授权，无法撤销。请先保存文件备份。",
                    )}
                  </p>
                  <div className="buttons">
                    <button
                      className="danger"
                      disabled={!token}
                      onClick={async () => {
                        if (
                          !(await confirm(
                            t(
                              "删除当前账号在本机和云端的记录、备份及设备授权？此操作无法通过应用内备份撤销，请先导出。",
                            ),
                          ))
                        )
                          return;
                        void perform(async () => {
                          await eraseAll();
                          setHistory([]);
                          setMessage(
                            t("本机与云端记录、订阅和待发送提醒已删除。"),
                          );
                        });
                      }}
                    >
                      {t("删除全部数据")}
                    </button>
                  </div>
                </details>
              </>
            )}
          </fieldset>
        </div>
      </main>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(
  <ConfirmationProvider>
    <App />
  </ConfirmationProvider>,
);
