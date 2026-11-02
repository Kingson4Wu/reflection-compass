import { t } from "./i18n";
import { useState } from "react";
import type { RecordConflict } from "./records";
const display = (value: unknown) =>
  value === null
    ? t("（已删除／尚无记录）")
    : typeof value === "string"
      ? value || t("（空白）")
      : JSON.stringify(value, null, 2);
function ConflictCard({
  conflict,
  onResolve,
  busy,
}: {
  conflict: RecordConflict;
  onResolve: (
    key: string,
    choice: "local" | "remote" | { merged: string },
  ) => void;
  busy: boolean;
}) {
  const [merged, setMerged] = useState(
    typeof conflict.local === "string" ? conflict.local : "",
  );
  const [showMerge, setShowMerge] = useState(false);
  const [kind, date] = conflict.key.split(":");
  const label =
    kind === "direction"
      ? t("生活方向")
      : kind === "settings"
        ? t("提醒设置")
        : kind === "action"
          ? t("每日行动")
          : kind === "reflection"
            ? t("反思记录")
            : kind === "weekly"
              ? t("每周回顾")
              : kind === "evening"
                ? t("晚间回顾")
                : t("当日记录");
  return (
    <article className="record-conflict">
      <h3>
        {t(label)}
        {/^\d{4}-/.test(date) ? ` · ${date}` : ""}
      </h3>
      <p>{t(conflict.reason)}</p>
      <div className="conflict-versions">
        <div>
          <strong>{t("这台设备的版本")}</strong>
          <pre>{display(conflict.local)}</pre>
        </div>
        <div>
          <strong>{t("云端版本")}</strong>
          <pre>{display(conflict.remote)}</pre>
        </div>
      </div>
      {showMerge && (
        <label className="field">
          <span>{t("整理成一个版本")}</span>
          <textarea
            value={merged}
            maxLength={10000}
            rows={4}
            onChange={(event) => setMerged(event.target.value)}
          />
        </label>
      )}
      <div className="buttons">
        <button
          disabled={busy}
          onClick={() => onResolve(conflict.key, "local")}
        >
          {t("保留本机版本")}
        </button>
        <button
          disabled={busy}
          onClick={() => onResolve(conflict.key, "remote")}
        >
          {t("使用云端版本")}
        </button>
        {typeof conflict.local === "string" &&
          typeof conflict.remote === "string" && (
            <button
              disabled={busy}
              onClick={() =>
                showMerge
                  ? onResolve(conflict.key, { merged })
                  : setShowMerge(true)
              }
            >
              {showMerge ? t("保存合并内容") : t("手动合并文字")}
            </button>
          )}
      </div>
    </article>
  );
}
export function ConflictPanel({
  conflicts,
  onResolve,
  busy,
}: {
  conflicts: RecordConflict[];
  onResolve: (
    key: string,
    choice: "local" | "remote" | { merged: string },
  ) => void;
  busy: boolean;
}) {
  if (!conflicts.length) return null;
  return (
    <section className="conflict">
      <h2>{t("本机与云端都有修改")}</h2>
      <p>
        {t("其他记录已同步。以下内容保留双方版本，等待你确认；不会整份覆盖。")}
      </p>
      {conflicts.map((conflict) => (
        <ConflictCard
          key={conflict.id}
          conflict={conflict}
          onResolve={onResolve}
          busy={busy}
        />
      ))}
    </section>
  );
}
