"use client";

import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CommandIcon,
  CornerDownLeftIcon,
} from "lucide-react";
import { useSyncExternalStore } from "react";

import { cn } from "@/lib/utils";

const noSubscribe = () => () => {};

const isMac = () =>
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

// A key, written next to the action it triggers so shortcuts can be found by
// looking. Takes its colour from where it sits (a gold button, a muted link);
// hidden where there is no keyboard to press it with: touch screens (hover:none
// or a coarse pointer) and phone-width windows, wherever the browser reports.
export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd
      aria-hidden="true"
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center gap-1 rounded-sm border border-current/25 bg-current/10 px-1 font-mono text-xs font-medium uppercase opacity-70 max-sm:hidden [@media(hover:none)]:hidden [@media(pointer:coarse)]:hidden",
        className,
      )}
    >
      {children}
    </kbd>
  );
}

// Symbol keys as icons: the ↵ ⌘ ⌥ glyphs render tiny in the mono face, and
// the arrows wide and thin.
const KEY_ICON = { className: "size-3", strokeWidth: 2.5, "aria-hidden": true } as const;

const KEY_ICONS: Record<string, typeof CornerDownLeftIcon> = {
  "↵": CornerDownLeftIcon,
  "←": ArrowLeftIcon,
  "→": ArrowRightIcon,
};

// What goes inside a Kbd for a key name: an icon for the symbol keys, the
// machine's own modifier for "Mod", the text otherwise.
export function KeyLabel({ k }: { k: string }) {
  if (k === "Mod") return <ModKey />;
  const Icon = KEY_ICONS[k];
  return Icon ? <Icon {...KEY_ICON} /> : <>{k}</>;
}

export function EnterKey() {
  return <KeyLabel k="↵" />;
}

// Mac symbols on a Mac only: on Windows ⌃ and ⌥ aren't recognised, so the
// keys are spelled out as printed on the keyboard (Wael, 2026-10-22).
export function ModKey() {
  const mac = useSyncExternalStore(noSubscribe, isMac, () => false);
  return mac ? <CommandIcon {...KEY_ICON} /> : <>Ctrl</>;
}
