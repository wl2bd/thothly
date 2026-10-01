"use client";

import { isMac, Kbd } from "@/components/ui/kbd";
import { useState, useSyncExternalStore } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SHORTCUTS, useShortcut } from "@/lib/shortcuts";

const noSubscribe = () => () => {};

// The "?" list of every shortcut, so they can be found without reading docs.
export function ShortcutsHelp() {
  const [open, setOpen] = useState(false);
  const mac = useSyncExternalStore(noSubscribe, isMac, () => false);
  useShortcut("?", () => setOpen(true));
  return (
    <>
    {/* The list's own door, in the header: the key that opens it, as a
        button. Only where there is a keyboard. */}
    <button
      type="button"
      onClick={() => setOpen(true)}
      aria-label="Keyboard shortcuts"
      aria-keyshortcuts="?"
      className="text-muted-foreground hover:text-foreground px-1 py-2 transition-colors max-sm:hidden [@media(hover:none)]:hidden"
    >
      <Kbd>?</Kbd>
    </button>
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
                  <Kbd key={k} className="text-muted-foreground">
                    {k === "Mod" ? (mac ? "⌘" : "Ctrl") : k}
                  </Kbd>
                ))}
              </dd>
            </div>
          ))}
        </dl>
      </DialogContent>
    </Dialog>
    </>
  );
}
