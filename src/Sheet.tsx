import { t } from "./i18n";
import {
  useEffect,
  useId,
  useRef,
  type ReactNode,
  type RefObject,
} from "react";
export function Sheet({
  open,
  title,
  onClose,
  opener,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  opener?: RefObject<HTMLElement | null>;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    id = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) {
      dialog.close();
      requestAnimationFrame(() =>
        opener?.current?.focus({ preventScroll: true }),
      );
    }
  }, [open, opener]);
  return (
    <dialog
      ref={ref}
      className="editor-sheet"
      aria-labelledby={id}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClose={() => {
        if (open) onClose();
      }}
    >
      <header className="sheet-toolbar">
        <h2 id={id}>{t(title)}</h2>
        <button onClick={onClose}>{t("完成")}</button>
      </header>
      <div className="sheet-content">{children}</div>
    </dialog>
  );
}
