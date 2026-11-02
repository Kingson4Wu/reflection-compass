import { t } from "./i18n";
import { useId, useRef, useState } from "react";
import { Sheet } from "./Sheet";
import { Icon } from "./Icon";
export function EditableRow({
  label,
  value,
  onChange,
  placeholder = t("留白也可以"),
  status,
  onEditingChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  status?: string;
  onEditingChange?: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null),
    id = useId();
  return (
    <>
      <button
        ref={button}
        type="button"
        className="editable-row"
        aria-label={t(label)}
        onClick={() => {
          onEditingChange?.(true);
          setOpen(true);
        }}
      >
        <span className="row-content">
          <span className="row-label">{t(label)}</span>
          <span className={`row-preview${value ? "" : " is-empty"}`}>
            {value || placeholder}
          </span>
        </span>
        <Icon name="chevron" />
      </button>
      <Sheet
        open={open}
        title={t(label)}
        onClose={() => {
          setOpen(false);
          onEditingChange?.(false);
        }}
        opener={button}
      >
        <p className="editor-status" role="status">
          {status ?? t("修改自动保存")}
        </p>
        <label className="sr-only" htmlFor={id}>
          {t(label)}
        </label>
        <textarea
          id={id}
          autoFocus
          className="editor-input"
          aria-label={t(label)}
          value={value}
          placeholder={
            placeholder === t("留白也可以") ? t("写下此刻的想法…") : placeholder
          }
          maxLength={10000}
          onChange={(event) => onChange(event.target.value)}
        />
      </Sheet>
    </>
  );
}
