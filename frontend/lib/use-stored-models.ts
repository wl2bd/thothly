"use client";

import { useMemo, useSyncExternalStore } from "react";

import { MODELS_CHANGED, parseModels, readModelsRaw, type StoredModels } from "@/lib/model-keys";

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(MODELS_CHANGED, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(MODELS_CHANGED, onChange);
  };
}

// The visitor's stored keys, live across this tab and others. The snapshot is
// the raw string (stable between reads), parsed once per change. The server
// render sees nothing stored, as it must: the key never leaves the browser.
export function useStoredModels(): StoredModels {
  const raw = useSyncExternalStore(subscribe, readModelsRaw, () => null);
  return useMemo(() => parseModels(raw), [raw]);
}
