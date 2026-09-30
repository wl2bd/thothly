"use client";

import { useSyncExternalStore } from "react";

import { isMac } from "@/lib/shortcuts";
import { cn } from "@/lib/utils";

const noSubscribe = () => () => {};

// A key, written next to the action it triggers so shortcuts can be found by
// looking. Takes its colour from where it sits (a gold button, a muted link);
// hidden where there is no keyboard to press it with.
export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd
      aria-hidden="true"
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-sm border border-current/25 px-1 font-sans text-2xs font-medium opacity-70 [@media(hover:none)]:hidden",
        className,
      )}
    >
      {children}
    </kbd>
  );
}

// Ctrl or ⌘, whichever this machine uses.
export function ModKey() {
  const mac = useSyncExternalStore(noSubscribe, isMac, () => false);
  return <>{mac ? "⌘" : "Ctrl"}</>;
}
