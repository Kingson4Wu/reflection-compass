import { t } from "./i18n";
import { useLanguage } from "./use-language";
import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
type Ask = (message: string) => Promise<boolean>;
const Context = createContext<Ask | null>(null);
export function useConfirm() {
  const ask = useContext(Context);
  if (!ask) throw new Error("Confirmation provider is missing");
  return ask;
}
export function ConfirmationProvider({ children }: { children: ReactNode }) {
  useLanguage();
  const [message, setMessage] = useState<string | null>(null),
    ref = useRef<HTMLDialogElement>(null),
    resolve = useRef<((value: boolean) => void) | null>(null),
    trigger = useRef<HTMLElement | null>(null),
    restoreFocus = useRef<HTMLElement | null>(null),
    title = useId(),
    description = useId();
  function finish(value: boolean) {
    const done = resolve.current;
    resolve.current = null;
    if (ref.current?.open) ref.current.close();
    setMessage(null);
    const opener = restoreFocus.current;
    requestAnimationFrame(() => {
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    });
    done?.(value);
  }
  function ask(message: string) {
    if (resolve.current) return Promise.resolve(false);
    restoreFocus.current =
      trigger.current ??
      (document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null);
    return new Promise<boolean>((done) => {
      resolve.current = done;
      setMessage(message);
    });
  }
  useEffect(() => {
    const pointer = (event: PointerEvent) => {
      if (!resolve.current && event.target instanceof Element)
        trigger.current = event.target.closest<HTMLElement>(
          "button,a,input,textarea,select",
        );
    };
    const keyboard = (event: KeyboardEvent) => {
      if (
        !resolve.current &&
        ["Enter", " "].includes(event.key) &&
        document.activeElement instanceof HTMLElement
      )
        trigger.current = document.activeElement;
    };
    document.addEventListener("pointerdown", pointer, true);
    document.addEventListener("keydown", keyboard, true);
    return () => {
      document.removeEventListener("pointerdown", pointer, true);
      document.removeEventListener("keydown", keyboard, true);
    };
  }, []);
  useEffect(() => {
    if (message && !ref.current?.open) ref.current?.showModal();
  }, [message]);
  useEffect(
    () => () => {
      resolve.current?.(false);
      resolve.current = null;
    },
    [],
  );
  return (
    <Context.Provider value={ask}>
      {children}
      <dialog
        ref={ref}
        className="confirmation"
        aria-labelledby={title}
        aria-describedby={description}
        onCancel={(event) => {
          event.preventDefault();
          finish(false);
        }}
        onClose={() => {
          if (resolve.current) finish(false);
        }}
        onClick={(event) => {
          if (event.target !== event.currentTarget) return;
          const box = event.currentTarget.getBoundingClientRect();
          if (
            event.clientX < box.left ||
            event.clientX > box.right ||
            event.clientY < box.top ||
            event.clientY > box.bottom
          )
            finish(false);
        }}
      >
        <div className="sheet-handle" aria-hidden="true" />
        <h2 id={title}>{t("确认操作")}</h2>
        <p id={description}>{t(message)}</p>
        <div className="confirmation-actions">
          <button autoFocus onClick={() => finish(false)}>
            {t("取消")}
          </button>
          <button className="danger" onClick={() => finish(true)}>
            {t("确认继续")}
          </button>
        </div>
      </dialog>
    </Context.Provider>
  );
}
