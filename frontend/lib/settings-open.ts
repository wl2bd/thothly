"use client";

import { useEffect, useSyncExternalStore } from "react";
import { flushSync } from "react-dom";

// Whether Settings is showing, and whether a compilation pane is on screen to
// show it in. Settings takes that pane's place rather than opening a second
// panel over it; a page with no pane (About, the examples) gets a stand-alone
// one in the same spot.

let open = false;
let panes = 0;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

// An external store can't ride a React transition, so the swap asks the
// browser for its transition directly (the `pane` one in globals.css). `animate: false`
// when a navigation already runs its own transition, which a second one would cut.
export function setSettingsOpen(value: boolean, animate = true) {
  if (open === value) return;
  open = value;
  if (!animate || !document.startViewTransition) return emit();
  const root = document.documentElement;
  root.dataset.paneSwitch = "";
  document.startViewTransition(() => flushSync(emit)).finished.finally(() => delete root.dataset.paneSwitch);
}

export function useSettingsOpen(): boolean {
  return useSyncExternalStore(subscribe, () => open, () => false);
}

export function usePaneCount(): number {
  return useSyncExternalStore(subscribe, () => panes, () => 0);
}

// A compilation pane says it is mounted, so Settings knows it has a home.
export function useRegisterPane() {
  useEffect(() => {
    panes += 1;
    emit();
    return () => {
      panes -= 1;
      emit();
    };
  }, []);
}

const WIDE = "(min-width: 64rem)";

function subscribeWide(onChange: () => void) {
  const mq = window.matchMedia(WIDE);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

// The two panes sit side by side from `lg` up. Below, the pane is under the
// work, out of sight, so Settings opens full screen instead.
export function useWide(): boolean {
  return useSyncExternalStore(subscribeWide, () => window.matchMedia(WIDE).matches, () => true);
}
