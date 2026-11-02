import { t, intlLocale } from "./i18n";
import { useConfirm } from "./Confirmation";
import { useEffect, useState } from "react";
import { request } from "./store";
interface Member {
  id: string;
  email: string | null;
  name: string;
  seat: number;
  status: "owner" | "invited" | "active";
  invited_until: number | null;
}
export function MemberSettings({ token }: { token: string }) {
  const confirm = useConfirm();
  const [members, setMembers] = useState<Member[] | null>(null),
    [email, setEmail] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  async function refresh() {
    setMembers(await request<Member[]>("members", token));
  }
  useEffect(() => {
    let active = true;
    setMembers(null);
    if (token)
      void request<Member[]>("members", token)
        .then((value) => {
          if (active) setMembers(value);
        })
        .catch(() => {});
    return () => {
      active = false;
    };
  }, [token]);
  async function perform(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
      await refresh();
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!members) return null;
  const used = members.filter(
    (m) => m.status !== "invited" || (m.invited_until ?? 0) > Date.now(),
  ).length;
  return (
    <details className="card settings-disclosure">
      <summary>{t("邀请与成员")}</summary>
      <p className="hint">
        {t("已占用")}
        {used}
        {t(
          "/5 个名额（包含管理员）。邀请有效期 7 天，对方使用指定的 Gmail 或 Google Workspace 邮箱登录即可加入。",
        )}
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void perform(async () => {
            await request("members", token, {
              method: "POST",
              body: JSON.stringify({ email: email.trim() }),
            });
            setEmail("");
            setMessage(
              t("邀请已创建。请自行把应用链接发给对方；系统不会发送邀请邮件。"),
            );
          });
        }}
      >
        <label className="field">
          <span>{t("邀请邮箱")}</span>
          <input
            type="email"
            required
            maxLength={254}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <button className="primary" disabled={busy || used >= 5}>
          {t("创建邀请")}
        </button>
      </form>
      {message && <p role="status">{t(message)}</p>}
      {members.map((member) => (
        <div className="device-row" key={member.id}>
          <div>
            <strong>{member.email ?? t("尚未绑定 Google 的管理员")}</strong>
            <p className="hint">
              {member.seat === 1
                ? t("管理员")
                : member.status === "active"
                  ? t("已加入")
                  : (member.invited_until ?? 0) <= Date.now()
                    ? t("邀请已过期")
                    : t("待加入")}
              {member.status === "invited" && member.invited_until
                ? t(
                    ` · ${new Date(member.invited_until).toLocaleString(intlLocale())} 到期`,
                  )
                : ""}
            </p>
          </div>
          {member.seat !== 1 && (
            <button
              disabled={busy}
              onClick={async () => {
                if (
                  await confirm(
                    member.status === "invited"
                      ? t("撤销此邀请并释放名额？")
                      : t(
                          "移除此成员并删除其云端记录、备份、设备和提醒？此操作不能撤销，已下载的本机副本不会被远程擦除。",
                        ),
                  )
                )
                  void perform(async () => {
                    await request("members/" + member.id, token, {
                      method: "DELETE",
                    });
                    setMessage(t("成员/邀请已移除，名额已释放。"));
                  });
              }}
            >
              {member.status === "invited" ? t("撤销邀请") : t("移除成员")}
            </button>
          )}
        </div>
      ))}
    </details>
  );
}
