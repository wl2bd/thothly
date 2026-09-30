"use client";

import { useState, useSyncExternalStore } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { isMac, SHORTCUTS, useShortcut } from "@/lib/shortcuts";

const noSubscribe = () => () => {};

// The "?" list of every shortcut, so they can be found without reading docs.
export function ShortcutsHelp() {
  const [open, setOpen] = useState(false);
  const mac = useSyncExternalStore(noSubscribe, isMac, () => false);
  useShortcut("?", () => setOpen(true));
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>Single keys work when you are not typing in a field.</DialogDescription>
        </DialogHeader>
        <dl className="flex flex-col">
          {SHORTCUTS.map((s) => (
            <div key={s.label} className="flex items-center justify-between gap-4 border-b py-2 text-sm last:border-b-0">
              <dt className="flex flex-col">
                {s.label}
                <span className="text-muted-foreground text-xs">{s.where}</span>
              </dt>
              <dd className="flex shrink-0 gap-1">
                {s.keys.map((k) => (
                  <kbd
                    key={k}
                    className="bg-muted text-muted-foreground min-w-6 rounded-sm border px-1.5 py-0.5 text-center font-sans text-xs"
                  >
                    {k === "Mod" ? (mac ? "⌘" : "Ctrl") : k}
                  </kbd>
                ))}
              </dd>
            </div>
          ))}
        </dl>
      </DialogContent>
    </Dialog>
  );
}
