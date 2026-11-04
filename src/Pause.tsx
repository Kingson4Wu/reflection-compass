import { questionText } from "./language";
import { t, getLanguage } from "./i18n";
import { useLayoutEffect, useRef, useState } from "react";
import { QuestionPicker } from "./QuestionPicker";

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const input = ref.current;
    if (!input) return;
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 320) + "px";
    input.style.overflowY = input.scrollHeight > 320 ? "auto" : "hidden";
  }, [value]);
  return (
    <label className="field">
      <span>{t(label)}</span>
      <textarea
        ref={ref}
        rows={3}
        maxLength={10000}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}
export function Pause({
  question,
  setQuestion,
  answer,
  setAnswer,
  next,
  setNext,
  late,
  onSave,
  onLeave,
}: {
  question: string;
  setQuestion: (value: string) => void;
  answer: string;
  setAnswer: (value: string) => void;
  next: string;
  setNext: (value: string) => void;
  late: boolean;
  onSave: (adopt: boolean) => string | null;
  onLeave: () => void;
}) {
  const [feedback, setFeedback] = useState("");
  return (
    <section className="card reflection support-pause">
      {late && (
        <p className="hint">
          {t("这是一条较早的提醒。此刻的选择，留在今天就好。")}
        </p>
      )}
      <QuestionPicker
        value={questionText(question, getLanguage())}
        onChange={setQuestion}
      />
      <h2 className="question selectable-text">
        {questionText(question, getLanguage())}
      </h2>
      <p className="pause-caption">{t("想一下就好，也可以什么都不写。")}</p>
      <button className="primary pause-return" onClick={onLeave}>
        {t("回到今天")}
      </button>
      <details
        className="support-disclosure pause-writing"
        open={answer || next ? true : undefined}
      >
        <summary>{t("记一句，或调整下一步")}</summary>
        <Field
          label={t("此刻，我注意到……")}
          value={answer}
          onChange={setAnswer}
          placeholder={t("一句观察就够了，也可以留空。")}
        />
        <Field
          label={t("如果再次遇到这个情境，我就……")}
          value={next}
          onChange={setNext}
          placeholder={t("想做的小调整，可以直接放入今天。")}
        />
        {feedback && (
          <p className="inline-feedback" role="status">
            {t(feedback)}
          </p>
        )}
        <div className="pause-save-actions">
          {next.trim() && (
            <button
              className="primary"
              onClick={() => setFeedback(onSave(true) ?? "")}
            >
              {t("采用为今天的行动")}
            </button>
          )}
          <button
            disabled={!answer.trim() && !next.trim()}
            onClick={() => setFeedback(onSave(false) ?? "")}
          >
            {t("记录这次停顿")}
          </button>
        </div>
      </details>
    </section>
  );
}
