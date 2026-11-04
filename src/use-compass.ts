import { t } from "./i18n";
import type { GoogleSession } from "./account";
import { useState, useEffect, useRef } from "react";
import { stateSchema, type State } from "./domain";
import { appPath, sessionKey } from "./deployment";
import {
  readStoredAuth,
  restoreRememberedAuth,
  saveAuth,
  type Auth,
} from "./auth-storage";
import {
  load,
  hasStoredSnapshot,
  save,
  clear,
  request,
  saveRestorePoint,
  type Snapshot,
} from "./store";
import {
  fresh,
  queueChange,
  bootstrapSnapshot,
  applyReply,
  resolveRecord,
} from "./sync-model";
import type { SyncResponse } from "./records";
function initialAuth(): Auth {
  try {
    const stored = readStoredAuth();
    if (stored) return stored;
    return {
      token: sessionStorage.getItem(sessionKey) ?? "",
      id: crypto.randomUUID(),
      name: /iPhone/.test(navigator.userAgent)
        ? t("我的 iPhone")
        : /iPad/.test(navigator.userAgent)
          ? t("我的 iPad")
          : /Mac/.test(navigator.userAgent)
            ? t("我的 Mac")
            : t("我的设备"),
      remember: true,
    };
  } catch {
    return {
      token: "",
      id: crypto.randomUUID(),
      name: t("我的设备"),
      remember: true,
    };
  }
}
export function useCompass() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null),
    [auth, setAuth] = useState(initialAuth),
    [tokenInput, setTokenInput] = useState(""),
    [deviceName, setDeviceName] = useState(auth.name),
    [remember, setRemember] = useState(auth.remember),
    [busy, setBusy] = useState(false),
    [syncing, setSyncing] = useState(false),
    [status, setStatus] = useState("仅保存在本机"),
    [message, setMessage] = useState(""),
    [storageError, setStorageError] = useState(false);
  const blocked = useRef("");
  const ref = useRef<Snapshot | null>(null),
    authRef = useRef(auth),
    queue = useRef(Promise.resolve(true)),
    lock = useRef(false),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    failures = useRef(0),
    ready = useRef(false),
    alive = useRef(true);
  authRef.current = auth;
  function rememberAuth(value: Auth) {
    authRef.current = value;
    setAuth(value);
    void saveAuth(value).catch(() => {
      setMessage("设备登录信息无法持久保存，本次会话仍可使用。");
    });
  }

  function persist(value: Snapshot, announce = false) {
    const accountId = authRef.current.accountId;
    queue.current = queue.current.then(async () => {
      try {
        await save(value, accountId);
        if (announce && ref.current === value)
          setStatus(
            value.conflicts?.length ? "有冲突待确认" : "本机已保存 · 等待同步",
          );
        return true;
      } catch {
        setStorageError(true);
        setStatus("本机保存失败");
        setMessage("本机保存失败。请立即导出数据，避免关闭页面。");
        return false;
      }
    });
    return queue.current;
  }
  function publish(value: Snapshot) {
    ref.current = value;
    setSnapshot(value);
  }
  function schedule(delay = 1800) {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void sync(), delay);
  }
  function change(edit: (draft: State) => void) {
    if (!ref.current) return;
    const state = structuredClone(ref.current.state);
    edit(state);
    const value = queueChange(ref.current, stateSchema.parse(state));
    publish(value);
    setStatus("正在保存到本机…");
    void persist(value, true);
    schedule();
  }
  async function ensureDevice() {
    const current = authRef.current;
    if (!current.token) return;
    if (current.token.startsWith("dv_")) return;
    const result = await request<{ id: string; name: string; token?: string }>(
      "devices",
      current.token,
      {
        method: "POST",
        body: JSON.stringify({ id: current.id, name: current.name }),
      },
    );
    rememberAuth({
      ...current,
      id: result.id,
      name: result.name,
      token: result.token ?? current.token,
    });
  }
  async function sync(force = false) {
    if (
      !ready.current ||
      !ref.current ||
      !authRef.current.token ||
      lock.current
    )
      return;
    if (!navigator.onLine) {
      setStatus("本机已保存 · 等待联网");
      return;
    }
    if (
      !force &&
      (document.visibilityState === "hidden" ||
        blocked.current === authRef.current.token)
    )
      return;
    lock.current = true;
    setSyncing(true);
    try {
      await queue.current;
      await ensureDevice();
      let current = ref.current!;
      if (!current.baseState || !current.operations) {
        const remote = await request<{ state: State; revision: number }>(
          "state",
          authRef.current.token,
        );
        current = bootstrapSnapshot(ref.current!, remote);
        publish(current);
      }
      const batch = (current.operations ?? [])
        .slice(0, 100)
        .map((op) => ({ ...op, sent: true }));
      while (
        batch.length > 1 &&
        new TextEncoder().encode(JSON.stringify(batch)).byteLength > 500000
      )
        batch.pop();
      const ids = new Set(batch.map((op) => op.id));
      const marked = {
        ...current,
        operations: (current.operations ?? []).map((op) =>
          ids.has(op.id) ? { ...op, sent: true } : op,
        ),
      };
      publish(marked);
      if (!(await persist(marked)))
        throw new Error("本机保存失败，尚未提交云端。");
      const result = await request<SyncResponse>(
        "sync",
        authRef.current.token,
        {
          method: "POST",
          body: JSON.stringify({
            deviceId: authRef.current.id,
            operations: batch.map(({ sent, ...op }) => op),
          }),
        },
      );
      const updated = applyReply(ref.current!, result);
      publish(updated);
      if (!(await persist(updated)))
        throw new Error("云端已处理，但本机确认未保存，请导出本机备份。");
      failures.current = 0;
      const latest = ref.current!;
      setStatus(
        latest.conflicts?.length
          ? `${latest.conflicts.length} 条冲突待确认`
          : latest.operations?.length
            ? "本机已保存 · 等待同步"
            : "已同步到云端",
      );
      if (latest.operations?.length) schedule(100);
    } catch (error) {
      failures.current++;
      const err = error as Error & { status?: number };
      if (err.status === 401) {
        blocked.current = authRef.current.token;
        setStatus("设备授权已失效 · 请重新连接");
        setMessage(err.message);
      } else {
        setStatus("本机已保存 · 同步未完成");
        if (force) setMessage(err.message);
        schedule(Math.min(60000, 2000 * 2 ** Math.min(failures.current, 5)));
      }
    } finally {
      lock.current = false;
      if (alive.current) setSyncing(false);
    }
  }
  useEffect(() => {
    alive.current = true;
    void (async () => {
      if (!authRef.current.token && !readStoredAuth()) {
        try {
          const restored = await restoreRememberedAuth();
          if (restored && alive.current && !authRef.current.token) {
            rememberAuth(restored);
            setDeviceName(restored.name);
            setRemember(restored.remember);
          }
        } catch {}
      }
      const current = authRef.current;
      if (current.token && current.remember) {
        try {
          await saveAuth(current);
        } catch {
          setMessage("设备登录信息无法持久保存，本次会话仍可使用。");
        }
      }
      if (!current.token && !current.accountId && !(await hasStoredSnapshot()))
        rememberAuth({ ...current, accountId: "guest" });
      return load(authRef.current.accountId);
    })()
      .then((value) => {
        if (!alive.current) return;
        publish(value);
        ready.current = true;
        setStatus(value.dirty ? "本机已保存 · 等待同步" : "仅保存在本机");
        if (authRef.current.token) schedule(0);
      })
      .catch(() => {
        setStorageError(true);
        setMessage(
          "无法读取本机记录。请检查浏览器存储权限，避免清除已有数据。",
        );
      });
    navigator.serviceWorker
      ?.register(appPath("sw.js"), { scope: appPath() })
      .catch(() => setMessage("离线功能未能启用，请刷新后重试。"));
    const foreground = () => {
      if (document.visibilityState === "visible") void sync();
    };
    const online = () => void sync();
    document.addEventListener("visibilitychange", foreground);
    window.addEventListener("focus", foreground);
    window.addEventListener("online", online);
    const interval = setInterval(() => void sync(), 30000);
    return () => {
      alive.current = false;
      ready.current = false;
      if (timer.current) clearTimeout(timer.current);
      clearInterval(interval);
      document.removeEventListener("visibilitychange", foreground);
      window.removeEventListener("focus", foreground);
      window.removeEventListener("online", online);
    };
  }, []);
  async function connect(event: React.FormEvent) {
    event.preventDefault();
    if (lock.current) return;
    setBusy(true);
    try {
      const value: Auth = {
        ...authRef.current,
        token: tokenInput.trim(),
        name: deviceName.trim() || t("我的设备"),
        remember,
      };
      const result = await request<{
        id: string;
        name: string;
        token?: string;
      }>("devices", value.token, {
        method: "POST",
        body: JSON.stringify({ id: value.id, name: value.name }),
      });
      const nextSnapshot =
        authRef.current.accountId && authRef.current.accountId !== "owner"
          ? await load("owner")
          : ref.current!;
      rememberAuth({
        ...value,
        accountId: "owner",
        user: undefined,
        id: result.id,
        name: result.name,
        token: result.token ?? value.token,
      });
      publish(nextSnapshot);
      setTokenInput("");
      blocked.current = "";
      await sync(true);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function switchSession(value: Auth) {
    setBusy(true);
    if (timer.current) clearTimeout(timer.current);
    try {
      while (lock.current)
        await new Promise((resolve) => setTimeout(resolve, 50));
      lock.current = true;
      ready.current = false;
      await queue.current;
      const stored = await load(value.accountId);
      rememberAuth(value);
      setDeviceName(value.name);
      publish(stored);
      blocked.current = "";
      setMessage("");
      setStatus(value.token ? "正在连接云端…" : "已退出 · 当前为本机访客");
    } finally {
      ready.current = true;
      lock.current = false;
      setBusy(false);
    }
    if (value.token) await sync(true);
  }
  async function googleConnected(session: GoogleSession) {
    await switchSession({
      token: session.token,
      id: session.id,
      name: session.name,
      remember,
      accountId: session.user.id,
      user: session.user,
      expiresAt: session.expiresAt,
    });
  }
  function logout() {
    void switchSession({
      token: "",
      id: crypto.randomUUID(),
      name: t("我的设备"),
      remember: true,
      accountId: "guest",
    }).catch((error) => setMessage((error as Error).message));
  }
  function resolve(
    key: string,
    choice: "local" | "remote" | { merged: string },
  ) {
    if (!ref.current) return;
    const value = resolveRecord(ref.current, key, choice);
    publish(value);
    void persist(value, true).then(() => void sync(true));
  }
  async function importState(state: State) {
    if (!ref.current) return;
    const accountId = authRef.current.accountId;
    await queue.current;
    if (authRef.current.accountId !== accountId)
      throw new Error("账号已切换，请重新选择备份。");
    await saveRestorePoint(ref.current, accountId);
    if (authRef.current.accountId !== accountId)
      throw new Error("账号已切换，请重新选择备份。");
    const value = queueChange(ref.current, stateSchema.parse(state), true);
    publish(value);
    await persist(value, true);
    schedule(0);
  }
  async function acceptCloud(state: State, revision: number) {
    if (!ref.current) return;
    await saveRestorePoint(ref.current, authRef.current.accountId);
    const value: Snapshot = {
      ...fresh(),
      state,
      baseState: state,
      revision,
      lastSyncedAt: new Date().toISOString(),
    };
    publish(value);
    await persist(value);
    setStatus("已同步到云端");
  }
  async function rename() {
    const current = authRef.current;
    await request("devices", current.token, {
      method: "POST",
      body: JSON.stringify({
        id: current.id,
        name: deviceName.trim() || t("我的设备"),
      }),
    });
    rememberAuth({ ...current, name: deviceName.trim() || t("我的设备") });
  }
  async function restoreCloud(id: string) {
    if (lock.current) throw new Error("正在同步，请稍后重试。");
    if (ref.current?.dirty) throw new Error("请先同步并处理冲突。");
    lock.current = true;
    setBusy(true);
    try {
      await queue.current;
      const result = await request<{ state: State; revision: number }>(
        "backups/" + encodeURIComponent(id) + "/restore",
        authRef.current.token,
        {
          method: "POST",
          body: JSON.stringify({ revision: ref.current?.revision ?? 0 }),
        },
      );
      await acceptCloud(result.state, result.revision);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function eraseAll() {
    if (lock.current) throw new Error("正在同步，请稍后重试。");
    if (!authRef.current.token) throw new Error("请先连接云端。");
    lock.current = true;
    try {
      if (timer.current) clearTimeout(timer.current);
      await queue.current;
      await request("data", authRef.current.token, { method: "DELETE" });
      await clear(authRef.current.accountId);
      await save(fresh(), authRef.current.accountId);
      reset();
    } finally {
      lock.current = false;
    }
  }
  function reset() {
    const value = fresh();
    publish(value);
    logout();
  }
  return {
    snapshot,
    accountId: auth.accountId,
    user: auth.user,
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
    token: auth.token,
    tokenInput,
    setTokenInput,
    deviceId: auth.id,
    deviceName,
    setDeviceName,
    remember,
    setRemember,
    connect,
    logout,
    resolve,
    importState,
    acceptCloud,
    reset,
    rename,
    restoreCloud,
    eraseAll,
  };
}
