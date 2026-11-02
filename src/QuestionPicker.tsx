import { questionText } from "./language";
import { t, getLanguage } from "./i18n";
import { useRef, useState } from "react";
import { Sheet } from "./Sheet";
import { Icon } from "./Icon";
import { QUESTIONS } from "./domain";
export function QuestionPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false),
    ref = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button
        className="question-trigger"
        ref={ref}
        onClick={() => setOpen(true)}
        aria-label={t("选择一个问题")}
      >
        {t("反思问题")}
        <Icon name="chevron" />
      </button>
      <Sheet
        open={open}
        title={t("选择一个问题")}
        onClose={() => setOpen(false)}
        opener={ref}
      >
        <div className="question-options">
          {[...new Set([questionText(value, "zh-CN"), ...QUESTIONS])].map(
            (question) => (
              <button
                key={questionText(question, getLanguage())}
                aria-pressed={question === questionText(value, "zh-CN")}
                onClick={() => {
                  onChange(question);
                  setOpen(false);
                }}
              >
                <span>{questionText(question, getLanguage())}</span>
                {questionText(value, "zh-CN") === question && (
                  <Icon name="check" />
                )}
              </button>
            ),
          )}
        </div>
      </Sheet>
    </>
  );
}
