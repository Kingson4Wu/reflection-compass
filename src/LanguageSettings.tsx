import { setLanguage, t } from "./i18n";
import { useLanguage } from "./use-language";
import { normalizeLanguage } from "./language";

export function LanguageSettings({
  notificationPending,
}: {
  notificationPending: boolean;
}) {
  const language = useLanguage();
  return (
    <section className="card">
      <label htmlFor="interface-language">
        {language === "en" ? "Language" : "界面语言"}
      </label>
      <select
        id="interface-language"
        value={language}
        onChange={(event) => setLanguage(normalizeLanguage(event.target.value))}
      >
        <option value="zh-CN">简体中文</option>
        <option value="en">English</option>
      </select>
      <p className="hint">{t("仅用于这台设备。你的记录保留原文。")}</p>
      {notificationPending && (
        <p role="status" className="hint">
          {t("界面语言已切换，通知语言暂未同步；联网后自动重试。")}
        </p>
      )}
    </section>
  );
}
