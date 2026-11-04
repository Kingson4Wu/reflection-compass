import { t } from "./i18n";
export function Continuation({
  choices,
  onAdopt,
  title = t("接着昨天，也可以重新选"),
}: {
  choices: { id: string; text: string }[];
  onAdopt: (id: string, text: string) => void;
  title?: string;
}) {
  if (!choices.length) return null;
  return (
    <details className="support-disclosure continuation">
      <summary>{t(title)}</summary>
      <p className="hint">{t("只在你想继续时采用。")}</p>
      <ul>
        {choices.map((choice) => (
          <li key={choice.id}>
            <span className="selectable-text">{choice.text}</span>
            <button
              aria-label={t(`继续：${choice.text}`)}
              onClick={() => onAdopt(choice.id, choice.text)}
            >
              {t("继续")}
            </button>
          </li>
        ))}
      </ul>
    </details>
  );
}
