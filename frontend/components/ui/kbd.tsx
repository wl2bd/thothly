"use client";

import { CornerDownLeftIcon } from "lucide-react";
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
        "inline-flex h-4 min-w-4 items-center justify-center gap-1 rounded-[3px] border border-current/25 px-[3px] font-mono text-3xs font-medium uppercase opacity-70 [@media(hover:none)]:hidden",
        className,
      )}
    >
      {children}
    </kbd>
  );
}

// Enter as an icon: the ↵ glyph renders tiny in the mono face.
export function EnterKey() {
  return <CornerDownLeftIcon className="size-2.5" strokeWidth={2.5} />;
}

// Ctrl or ⌘, whichever this machine uses.
export function ModKey() {
  const mac = useSyncExternalStore(noSubscribe, isMac, () => false);
  return <>{mac ? "⌘" : "Ctrl"}</>;
}
