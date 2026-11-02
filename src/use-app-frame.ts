import { useEffect, useLayoutEffect, useRef, useState } from "react";
export function useAppFrame(
  view: string,
  account: string | undefined,
  ready: boolean,
) {
  const scrollRef = useRef<HTMLDivElement>(null),
    positions = useRef<Record<string, number>>({}),
    disclosures = useRef<Record<string, string[]>>({}),
    active = useRef(view),
    owner = useRef(account);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  useLayoutEffect(() => {
    if (!ready || !scrollRef.current) return;
    if (owner.current !== account) {
      positions.current = {};
      disclosures.current = {};
      owner.current = account;
    }
    active.current = view;
    const container = scrollRef.current;
    for (const details of container.querySelectorAll("details")) {
      const name = details.querySelector("summary")?.textContent ?? "";
      details.open = (disclosures.current[view] ?? []).includes(name);
    }
    container.scrollTop = positions.current[view] ?? 0;
  }, [view, account, ready]);
  useEffect(() => {
    const container = scrollRef.current;
    if (!ready || !container) return;
    const toggle = () => {
      disclosures.current[active.current] = Array.from(
        container.querySelectorAll("details[open]"),
      ).map((el) => el.querySelector("summary")?.textContent ?? "");
    };
    container.addEventListener("toggle", toggle, true);
    return () => container.removeEventListener("toggle", toggle, true);
  }, [ready]);
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    let baseline = window.innerHeight,
      lastWidth = window.innerWidth,
      frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (Math.abs(viewport.scale - 1) > 0.05) return;
        if (Math.abs(window.innerWidth - lastWidth) > 80) {
          baseline = window.innerHeight;
          lastWidth = window.innerWidth;
        }
        baseline = Math.max(baseline, window.innerHeight);
        const focused = document.activeElement;
        const editing =
          focused instanceof HTMLTextAreaElement ||
          (focused instanceof HTMLInputElement &&
            !["checkbox", "radio", "button", "file"].includes(focused.type));
        const small =
          matchMedia("(max-width: 900px) and (pointer: coarse)").matches ||
          window.innerWidth <= 640;
        const keyboard = small && editing && baseline - viewport.height > 120;
        setKeyboardOpen(keyboard);
        document.documentElement.style.setProperty(
          "--app-height",
          `${small ? viewport.height : window.innerHeight}px`,
        );
        document.documentElement.style.setProperty(
          "--app-top",
          `${keyboard ? viewport.offsetTop : 0}px`,
        );
        if (
          keyboard &&
          focused instanceof HTMLElement &&
          scrollRef.current?.contains(focused)
        ) {
          const box = focused.getBoundingClientRect(),
            area = scrollRef.current.getBoundingClientRect();
          if (box.bottom > area.bottom - 12)
            scrollRef.current.scrollTop += box.bottom - area.bottom + 12;
          if (box.top < area.top + 12)
            scrollRef.current.scrollTop -= area.top - box.top + 12;
        }
      });
    };
    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    document.addEventListener("focusin", update);
    document.addEventListener("focusout", update);
    return () => {
      cancelAnimationFrame(frame);
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      document.removeEventListener("focusin", update);
      document.removeEventListener("focusout", update);
      document.documentElement.style.removeProperty("--app-height");
      document.documentElement.style.removeProperty("--app-top");
    };
  }, []);
  function onScroll() {
    if (scrollRef.current)
      positions.current[active.current] = scrollRef.current.scrollTop;
  }
  function scrollToTop() {
    scrollRef.current?.scrollTo({
      top: 0,
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
  }
  return { scrollRef, onScroll, keyboardOpen, scrollToTop };
}
