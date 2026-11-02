import { t } from "./i18n";
import { useLanguage } from "./use-language";
import { useEffect, useRef, useState } from "react";
import { request } from "./store";
import type { GoogleSession, User } from "./account";
interface GoogleId {
  initialize(options: {
    client_id: string;
    nonce: string;
    auto_select: boolean;
    callback: (value: { credential: string }) => void;
  }): void;
  renderButton(
    element: HTMLElement,
    options: { theme: string; size: string; text: string; locale: string },
  ): void;
}
declare global {
  interface Window {
    google?: { accounts: { id: GoogleId } };
  }
}
let library: Promise<void> | undefined;
function loadGoogle() {
  if (window.google) return Promise.resolve();
  if (!library)
    library = new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => {
        script.remove();
        library = undefined;
        reject(new Error(t("Google 登录服务无法连接，请检查网络后重试。")));
      };
      document.head.appendChild(script);
    });
  return library;
}
export function GoogleLogin({
  token,
  name,
  user,
  onConnected,
  onLogout,
}: {
  token: string;
  name: string;
  user?: User;
  onConnected: (value: GoogleSession) => Promise<void>;
  onLogout: () => void;
}) {
  const language = useLanguage();
  const [config, setConfig] = useState<{
      clientId: string;
      configured: boolean;
    } | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [identity, setIdentity] = useState<User | undefined>(user);
  const button = useRef<HTMLDivElement>(null),
    callback = useRef(onConnected),
    generation = useRef(0);
  callback.current = onConnected;
  useEffect(() => {
    void request<{ clientId: string; configured: boolean }>("auth/config", "")
      .then(setConfig)
      .catch(() => setError(t("无法读取登录配置，请检查网络后刷新。")));
  }, []);
  useEffect(() => {
    const gen = ++generation.current;
    button.current?.replaceChildren();
    setIdentity(user);
    if (token && !user)
      void request<{
        user: { id: string; email: string | null; name: string };
        role: "admin" | "member";
      }>("me", token)
        .then((value) => {
          if (gen === generation.current)
            setIdentity({ ...value.user, role: value.role });
        })
        .catch(() => {});
    return () => {
      generation.current++;
    };
  }, [token, user, language]);
  async function start(linkOwner = false) {
    setBusy(true);
    setError("");
    const gen = ++generation.current;
    try {
      const verifier = Array.from(
        crypto.getRandomValues(new Uint8Array(32)),
        (byte) => byte.toString(16).padStart(2, "0"),
      ).join("");
      const challenge = await request<{ id: string; nonce: string }>(
        "auth/challenge",
        token,
        { method: "POST", body: JSON.stringify({ verifier, linkOwner }) },
      );
      await loadGoogle();
      if (gen !== generation.current) return;
      window.google!.accounts.id.initialize({
        client_id: config!.clientId,
        nonce: challenge.nonce,
        auto_select: false,
        callback: ({ credential }) => {
          if (gen !== generation.current) return;
          setBusy(true);
          void request<GoogleSession>("auth/google", "", {
            method: "POST",
            body: JSON.stringify({
              challengeId: challenge.id,
              verifier,
              credential,
              name: name.trim() || t("我的设备"),
            }),
          })
            .then((value) => callback.current(value))
            .then(() => {
              button.current?.replaceChildren();
            })
            .catch((error) => {
              setError((error as Error).message);
              button.current?.replaceChildren();
            })
            .finally(() => setBusy(false));
        },
      });
      button.current!.replaceChildren();
      window.google!.accounts.id.renderButton(button.current!, {
        theme: "outline",
        size: "large",
        text: "signin_with",
        locale: language === "en" ? "en" : "zh_CN",
      });
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function linkAdministrator() {
    if (token && identity?.role === "admin") {
      void start(true);
      return;
    }
    setError(
      t(
        "请先验证管理员身份：在下方输入原有个人访问密钥并连接，然后再次点击绑定按钮。首次验证完成后，日常使用 Google 登录即可。",
      ),
    );
    const recovery =
      document.querySelector<HTMLDetailsElement>(".recovery-login");
    if (recovery) {
      recovery.open = true;
      recovery.scrollIntoView({ block: "nearest" });
      recovery
        .querySelector<HTMLInputElement>('input[type="password"]')
        ?.focus();
    }
  }
  return (
    <div className="google-login">
      {identity?.email && (
        <div className="account-identity">
          <span className="account-avatar" aria-hidden="true">
            {(identity.name || identity.email).slice(0, 1).toUpperCase()}
          </span>
          <div>
            <strong>{identity.name || t("个人账号")}</strong>
            <small>{identity.email}</small>
          </div>
          {identity.role === "admin" && (
            <span className="account-role">{t("管理员")}</span>
          )}
        </div>
      )}
      {!identity?.email && (
        <p className="hint">
          {t("登录后同步个人记录。访客草稿单独保存在本机。")}
        </p>
      )}
      {config?.configured ? (
        <div className="buttons">
          <button disabled={busy} onClick={() => void start(false)}>
            {identity?.email ? t("切换账号") : t("使用 Google 登录")}
          </button>
          {!identity?.email && (
            <button disabled={busy} onClick={linkAdministrator}>
              {t("将现有数据绑定到 Google 账号")}
            </button>
          )}
        </div>
      ) : (
        <p role="status">
          {config
            ? t("Google 登录等待管理员完成配置。现有管理员可使用下方恢复入口。")
            : t("正在读取登录配置…")}
        </p>
      )}
      {token && (
        <button onClick={onLogout} disabled={busy}>
          {t("退出此设备")}
        </button>
      )}
      <div ref={button} />
      {busy && <p role="status">{t("正在处理登录…")}</p>}
      {error && <p role="alert">{t(error)}</p>}
    </div>
  );
}
