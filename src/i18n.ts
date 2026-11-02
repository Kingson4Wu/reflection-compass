import { APP_BASE } from "./deployment";
import { normalizeLanguage, type Language } from "./language";
import { translate } from "./translation";

const key = "compass-language:" + APP_BASE;
function readLanguage(): Language {
  try {
    return normalizeLanguage(globalThis.localStorage?.getItem(key));
  } catch {
    return "zh-CN";
  }
}
let language = readLanguage();
const listeners = new Set<() => void>();
export const getLanguage = () => language;
export function subscribeLanguage(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function setLanguage(value: Language) {
  language = normalizeLanguage(value);
  try {
    globalThis.localStorage?.setItem(key, language);
  } catch {
    /* In-memory choice still works. */
  }
  for (const listener of listeners) listener();
}
if (typeof window !== "undefined")
  window.addEventListener("storage", (event) => {
    if (event.key !== key && event.key !== null) return;
    language = readLanguage();
    for (const listener of listeners) listener();
  });
export const t = (source: string | undefined | null) =>
  translate(source ?? "", language);
export const intlLocale = () => (language === "en" ? "en-US" : "zh-CN");
export const productName = () => "Reflection Compass";
