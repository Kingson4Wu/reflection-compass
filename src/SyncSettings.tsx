import { t, intlLocale } from "./i18n";
import { useConfirm } from "./Confirmation";
import { useEffect, useRef, useState } from "react";
import {
  api,
  request,
  loadRestorePoint,
  type DeviceList,
  type CloudBackup,
  type Snapshot,
} from "./store";
import { createBackup, parseBackup, backupSummary } from "./backup";
import { toRecords, fromRecords, same } from "./records";
import { emptyState, type State } from "./domain";
export async function downloadBackupFile(
  value: unknown,
  name = "compass-backup.json",
  share = false,
) {
  const file = new File([JSON.stringify(value, null, 2)], name, {
    type: "application/json",
  });
  if (share && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title: t("Reflection Compass 备份"),
      });
      return true;
    } catch (error) {
      if ((error as Error).name === "AbortError") return false;
    }
  }
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}
export function DeviceSettings({
  token,
  id,
  name,
  setName,
  onRename,
  onLogout,
  refreshKey = 0,
}: {
  token: string;
  refreshKey?: number;
  id: string;
  name: string;
  setName: (value: string) => void;
  onRename: () => Promise<void>;
  onLogout: () => void;
}) {
  const confirm = useConfirm();
  const [list, setList] = useState<DeviceList | null>(null),
    [feedback, setFeedback] = useState(""),
    [busy, setBusy] = useState(false);
  const refreshGeneration = useRef(0);
  async function refresh() {
    const generation = ++refreshGeneration.current;
    if (!token) return;
    try {
      const result = await api("devices", token);
      if (generation === refreshGeneration.current) setList(result);
    } catch (error) {
      if (generation === refreshGeneration.current) throw error;
    }
  }
  useEffect(() => {
    if (!token) {
      setList(null);
      return;
    }
    void refresh().catch(() =>
      setFeedback(t("设备列表暂时不可用，请重新连接后刷新。")),
    );
    return () => {
      refreshGeneration.current++;
    };
  }, [token, refreshKey]);
  async function perform(fn: () => Promise<void>, refreshAfter = true) {
    setBusy(true);
    try {
      await fn();
      if (refreshAfter) await refresh();
    } catch (error) {
      setFeedback((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!token) return null;
  return (
    <details className="card settings-disclosure">
      <summary>{t("设备管理")}</summary>
      <p className="hint">{t("提醒只发往选定的一台设备。")}</p>
      <p className="hint">
        {t(
          "列表记录的是应用登录身份，同一台手机的旧登录可能单独列出；设备名称不代表不同的实体手机。",
        )}
      </p>
      {list?.targetId === "legacy-phone" && (
        <p className="hint">
          {t(
            "旧版提醒订阅尚未关联当前登录。请在当前设备开启通知，再将其设为提醒设备。",
          )}
        </p>
      )}
      <label className="field">
        <span>{t("这台设备的名称")}</span>
        <input
          value={name}
          maxLength={80}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <div className="buttons">
        <button
          disabled={!token || busy}
          onClick={() =>
            void perform(async () => {
              await onRename();
              setFeedback(t("设备名称已保存。"));
            })
          }
        >
          {t("保存设备名称")}
        </button>
        <button disabled={!token || busy} onClick={() => void perform(refresh)}>
          {t("刷新设备列表")}
        </button>
      </div>
      {feedback && (
        <p role="status" className="selectable-text">
          {t(feedback)}
        </p>
      )}
      {list?.devices.map((device) => (
        <div className="device-row" key={device.id}>
          <div>
            <strong>
              {device.id === "legacy-phone" ? t("旧版提醒订阅") : device.name}
              {device.id === id ? t("（当前）") : ""}
            </strong>
            <p className="hint">
              {device.target
                ? t("接收日常提醒")
                : device.subscribed
                  ? t("已开启通知，尚未选为提醒设备")
                  : t("仅同步数据")}
              {device.last_seen
                ? t(
                    ` · 最近连接 ${new Date(device.last_seen).toLocaleString(intlLocale())}`,
                  )
                : ""}
            </p>
          </div>
          <div className="buttons">
            {device.subscribed && !device.target && (
              <button
                disabled={busy}
                onClick={() =>
                  void perform(async () => {
                    await request("devices/target", token, {
                      method: "POST",
                      body: JSON.stringify({ id: device.id }),
                    });
                    setFeedback(t("提醒设备已切换。"));
                  })
                }
              >
                {t("设为提醒设备")}
              </button>
            )}
            <button
              disabled={busy}
              onClick={async () => {
                if (
                  await confirm(
                    t(
                      `移除“${device.name}”的访问权限？本机历史副本不会被远程擦除。`,
                    ),
                  )
                )
                  void perform(async () => {
                    await request(
                      "devices/" + encodeURIComponent(device.id),
                      token,
                      { method: "DELETE" },
                    );
                    if (device.id === id) onLogout();
                    setFeedback(t("设备访问权限已移除。"));
                  }, device.id !== id);
              }}
            >
              {t("移除设备")}
            </button>
          </div>
        </div>
      ))}
    </details>
  );
}
export function BackupSettings({
  snapshot,
  accountId,
  token,
  onImport,
  onRestore,
  onUndo,
}: {
  snapshot: Snapshot;
  accountId?: string;
  token: string;
  onImport: (state: State) => Promise<void>;
  onRestore: (id: string) => Promise<void>;
  onUndo: (state: State) => Promise<void>;
}) {
  const confirm = useConfirm();
  const fileInput = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<Awaited<
      ReturnType<typeof parseBackup>
    > | null>(null),
    [backups, setBackups] = useState<CloudBackup[]>([]),
    [feedback, setFeedback] = useState(""),
    [busy, setBusy] = useState(false),
    [undo, setUndo] = useState<Snapshot | null>(null);
  async function refresh() {
    if (token) setBackups(await api("backups", token));
    setUndo((await loadRestorePoint(accountId)) ?? null);
  }
  useEffect(() => {
    if (!token) setBackups([]);
    void refresh().catch(() => {});
  }, [token, accountId]);
  async function perform(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
      await refresh();
    } catch (error) {
      setFeedback((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const summary = preview ? backupSummary(preview.state) : null;
  return (
    <section className="card backup-settings">
      <h2>{t("备份与恢复")}</h2>
      <p className="hint">{t("导出的文件可存入 iCloud Drive，供日后恢复。")}</p>
      <div className="buttons">
        <button
          disabled={busy}
          onClick={() =>
            void perform(async () => {
              const saved = await downloadBackupFile(
                await createBackup(snapshot.state),
                `compass-${new Date().toISOString().slice(0, 10)}.json`,
                true,
              );
              setFeedback(
                saved
                  ? t("备份已交给系统保存，可选择 iCloud Drive。")
                  : t("已取消保存。"),
              );
            })
          }
        >
          {t("保存备份到文件")}
        </button>
      </div>
      <div className="import-file">
        <button
          className="import-trigger"
          onClick={() => fileInput.current?.click()}
          disabled={busy}
        >
          {t("从文件恢复")}
          <span aria-hidden="true">›</span>
        </button>
        <input
          ref={fileInput}
          hidden
          aria-label={t("选择备份文件（先预览，不会立即修改）")}
          type="file"
          accept="application/json,.json"
          disabled={busy}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) return;
            void perform(async () => {
              if (file.size > 5 * 1024 * 1024)
                throw new Error(t("备份文件超过 5 MB。"));
              setPreview(await parseBackup(JSON.parse(await file.text())));
              setFeedback(t("校验完成。请选择如何导入。"));
            });
          }}
        />
      </div>
      {preview && summary && (
        <div className="import-preview">
          <h3>{t("备份预览")}</h3>
          <p>
            {preview.createdAt
              ? new Date(preview.createdAt).toLocaleString(intlLocale())
              : t("旧版备份，无时间信息")}{" "}
            ·{" "}
            {t(
              `${summary.days} 天 · ${summary.actions} 项行动 · ${summary.reflections} 条反思`,
            )}
          </p>
          {preview.legacy && (
            <p>{t("这是旧版导出，格式有效，但不含完整性校验值。")}</p>
          )}
          <p className="hint">
            {t(
              "补充导入仅增加缺失记录、填补空白字段，已有内容保留当前版本。替换前会保存本机恢复点。",
            )}
          </p>
          <div className="buttons">
            <button
              disabled={busy}
              onClick={() =>
                void perform(async () => {
                  const existing = toRecords(snapshot.state),
                    incoming = toRecords(preview.state),
                    defaults = toRecords(emptyState());
                  let skipped = 0;
                  for (const [key, value] of Object.entries(incoming)) {
                    if (
                      !(key in existing) ||
                      same(existing[key], defaults[key])
                    )
                      existing[key] = value;
                    else if (!same(existing[key], value)) skipped++;
                  }
                  await onImport(fromRecords(existing));
                  setPreview(null);
                  setFeedback(
                    t(`备份已补充导入；${skipped} 条已有内容保留当前版本。`),
                  );
                })
              }
            >
              {t("补充导入")}
            </button>
            <button
              disabled={busy}
              onClick={async () => {
                if (
                  await confirm(
                    t(
                      "用备份替换本机内容，并在下次同步时更新云端？未同步的变化可能形成冲突。",
                    ),
                  )
                )
                  void perform(async () => {
                    const state = structuredClone(preview.state);
                    state.settings.paused = true;
                    await onImport(state);
                    setPreview(null);
                    setFeedback(t("备份已导入，提醒保持暂停。联网后将同步。"));
                  });
              }}
            >
              {t("用备份替换当前内容")}
            </button>
            <button disabled={busy} onClick={() => setPreview(null)}>
              {t("取消导入")}
            </button>
          </div>
        </div>
      )}
      {undo && (
        <button
          disabled={busy}
          onClick={() =>
            void perform(async () => {
              await onUndo(undo.state);
              setFeedback(t("已恢复导入前的本机内容。"));
            })
          }
        >
          {t("撤销上次本机导入")}
        </button>
      )}
      {feedback && (
        <p role="status" className="selectable-text">
          {t(feedback)}
        </p>
      )}
      {token && (
        <details className="settings-disclosure cloud-backups">
          <summary>{t("云端恢复点")}</summary>
          <p className="hint">
            {t(
              "每天自动保留快照，最近 30 天最多 60 份。恢复前会保留当前版本，并暂停提醒。",
            )}
          </p>
          <div className="buttons">
            <button
              disabled={busy || !token || snapshot.dirty}
              onClick={() =>
                void perform(async () => {
                  await api("backups", token, { method: "POST" });
                  setFeedback(t("云端恢复点已创建。"));
                })
              }
            >
              {t("立即创建云端备份")}
            </button>
            <button
              disabled={busy || !token}
              onClick={() => void perform(refresh)}
            >
              {t("刷新云端备份")}
            </button>
          </div>
          <div className="backup-list">
            {backups.map((backup) => (
              <div className="device-row" key={backup.id}>
                <div>
                  <strong>
                    {new Date(backup.created_at).toLocaleString(intlLocale())}
                  </strong>
                  <p className="hint">
                    {backup.reason === "daily"
                      ? t("每日自动备份")
                      : backup.reason === "before-restore"
                        ? t("恢复前保留的版本")
                        : t("手动备份")}
                  </p>
                </div>
                <div className="buttons">
                  <button
                    disabled={busy}
                    onClick={() =>
                      void perform(async () => {
                        const data = await request(
                          "backups/" + encodeURIComponent(backup.id),
                          token,
                        );
                        await downloadBackupFile(
                          data,
                          `compass-${backup.id.replaceAll(":", "-")}.json`,
                        );
                      })
                    }
                  >
                    {t("下载")}
                  </button>
                  <button
                    disabled={busy || snapshot.dirty}
                    onClick={async () => {
                      if (
                        await confirm(
                          t("恢复这份云端备份？会保留恢复前版本，并暂停提醒。"),
                        )
                      )
                        void perform(async () => {
                          await onRestore(backup.id);
                          setFeedback(t("云端备份已恢复，提醒已暂停。"));
                        });
                    }}
                  >
                    {t("恢复")}
                  </button>
                </div>
              </div>
            ))}
          </div>
          {snapshot.dirty && (
            <p className="hint">{t("请先同步并处理冲突，再恢复云端备份。")}</p>
          )}
        </details>
      )}
    </section>
  );
}
