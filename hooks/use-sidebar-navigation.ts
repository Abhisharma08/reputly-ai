"use client";
import { useEffect } from "react";
export function useSidebarNavigation(open: boolean, close: () => void) {
  useEffect(() => {
    if (!open) return;
    const sidebar = document.querySelector<HTMLElement>(".sidebar");
    const main = document.querySelector<HTMLElement>(".main-shell");
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    if (main) main.inert = true;
    document.body.style.overflow = "hidden";
    const focusable = () => Array.from(sidebar?.querySelectorAll<HTMLElement>('a[href], button:not(:disabled), select:not(:disabled), input:not(:disabled), [tabindex="0"]') || []).filter(el => el.getClientRects().length > 0);
    focusable()[0]?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); close(); }
      if (event.key !== "Tab") return;
      const elements = focusable(), first = elements[0], last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", keydown);
    const media = matchMedia("(min-width: 761px)");
    const resize = () => { if (media.matches) close(); };
    media.addEventListener("change", resize);
    return () => { if (main) main.inert = false; document.body.style.overflow = overflow; document.removeEventListener("keydown", keydown); media.removeEventListener("change", resize); previous?.focus(); };
  }, [open, close]);
}
