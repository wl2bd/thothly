"use client";

import { ChevronUpIcon, CommandIcon, CornerDownLeftIcon } from "lucide-react";
import { useSyncExternalStore } from "react";

import { cn } from "@/lib/utils";

const noSubscribe = () => () => {};

export const isMac = () =>
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

// A key, written next to the action it triggers so shortcuts can be found by
// looking. Takes its colour from where it sits (a gold button, a muted link);
// hidden where there is no keyboard to press it with.
export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd
      aria-hidden="true"
      className={cn(
        "inline-flex h-4 min-w-4 items-center justify-center gap-1 rounded-xs border border-current/25 px-0.75 font-mono text-3xs font-medium uppercase opacity-70 [@media(hover:none)]:hidden",
        className,
      )}
    >
      {children}
    </kbd>
  );
}

// Symbol keys as icons: the ↵ ⌘ ⌃ glyphs render tiny in the mono face.
const KEY_ICON = { className: "size-2.5", strokeWidth: 2.5, "aria-hidden": true } as const;

export function EnterKey() {
  return <CornerDownLeftIcon {...KEY_ICON} />;
}

// ⌘ on a Mac, the Control symbol elsewhere: a symbol reads faster than
// "CTRL" (Wael, 2026-10-22); ⌃ is the Control keycap of a Mac keyboard.
export function ModKey() {
  const mac = useSyncExternalStore(noSubscribe, isMac, () => false);
  return mac ? <CommandIcon {...KEY_ICON} /> : <ChevronUpIcon {...KEY_ICON} />;
}
