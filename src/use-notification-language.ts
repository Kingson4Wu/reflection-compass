import { useEffect, useRef, useState } from "react";
import { api } from "./store";
import type { Language } from "./language";

// Serialize updates: a slow response from an earlier choice must not win.
export function useNotificationLanguage(token: string, language: Language) {
  const queue = useRef(Promise.resolve());
  const generation = useRef(0);
  const reconcile = useRef<(() => void) | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    const update = () => {
      const current = ++generation.current;
      setFailed(false);
      if (!token) return;
      queue.current = queue.current.then(async () => {
        if (!active || current !== generation.current) return;
        try {
          await api("subscription", token, {
            method: "PATCH",
            body: JSON.stringify({ locale: language }),
          });
        } catch {
          if (active && current === generation.current) setFailed(true);
        }
      });
    };
    reconcile.current = update;
    update();
    window.addEventListener("online", update);
    return () => {
      active = false;
      reconcile.current = null;
      window.removeEventListener("online", update);
    };
  }, [token, language]);
  return { failed, reconcile: () => reconcile.current?.() };
}
