"use client";

import { useEffect, useRef } from "react";

// Keyboard shortcuts. A combo is a key, optionally prefixed by "mod+" (Ctrl,
// or Cmd on a Mac): "/", "?", "a", "arrowleft", "mod+enter". A bare key never
// fires while the visitor is typing in a field; a "mod+" combo does, so the
// primary action is reachable from the title field.

// Every shortcut the app has, for the "?" help. Kept here, beside the hook,
// so a new one is listed where it is declared.
export const SHORTCUTS: { keys: string[]; label: string; where: string }[] = [
  { keys: ["/"], label: "Search", where: "Home" },
  { keys: ["Enter"], label: "Add a pasted link", where: "Home" },
  { keys: ["Mod", "Enter"], label: "Review sources, or Compile", where: "Home, Review" },
  { keys: ["A"], label: "Select or deselect every item", where: "Review" },
  { keys: ["D"], label: "Download the EPUB", where: "Ready" },
  { keys: ["C"], label: "Copy the Markdown", where: "Ready" },
  { keys: ["←", "→"], label: "Previous or next chapter", where: "Ready" },
  { keys: ["N"], label: "New compilation", where: "Any compilation" },
  { keys: [","], label: "Settings", where: "Everywhere" },
  { keys: ["?"], label: "This list", where: "Everywhere" },
  { keys: ["Esc"], label: "Clear the search, or close Settings and dialogs", where: "Everywhere" },
];

export const isMac = () =>
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

function typing(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT"
  );
}

export function matches(combo: string, e: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey">): boolean {
  const mod = combo.startsWith("mod+");
  const key = mod ? combo.slice(4) : combo;
  if (e.altKey) return false;
  if (mod !== (e.ctrlKey || e.metaKey)) return false;
  return e.key.toLowerCase() === key;
}

export function useShortcut(combo: string, handler: () => void, enabled = true) {
  // The latest handler, without re-binding on every render.
  const ref = useRef(handler);
  useEffect(() => {
    ref.current = handler;
  });
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.repeat) return;
      if (!matches(combo, e)) return;
      if (!combo.startsWith("mod+") && typing(e.target)) return;
      // A dialog or menu that is open owns the keyboard.
      if (document.querySelector("[role=dialog][data-open], [role=menu][data-open]")) return;
      e.preventDefault();
      ref.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [combo, enabled]);
}
