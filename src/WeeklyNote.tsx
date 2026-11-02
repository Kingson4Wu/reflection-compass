import { t } from "./i18n";
import { useState } from "react";
import { EditableRow } from "./EditableRow";
import { weekNote } from "./support";
import type { State } from "./domain";

export function WeeklyNote({
  notes,
  today,
  status,
  onChange,
}: {
  notes: State["weekly"];
  today: string;
  status: string;
  onChange: (key: string, value: string) => void;
}) {
  const current = weekNote(notes, today);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const key = editingKey ?? current.key;
  return (
    <details className="support-disclosure weekly-entry">
      <summary>{t("本周，想调整什么")}</summary>
      <EditableRow
        label={t("写下本周的观察")}
        placeholder={t("有效的行动、反复的障碍、下周的一件事")}
        value={notes[key] ?? ""}
        status={t(`本次记录：${key} · ${t(status)}`)}
        onEditingChange={(open) => setEditingKey(open ? current.key : null)}
        onChange={(value) => onChange(key, value)}
      />
    </details>
  );
}
