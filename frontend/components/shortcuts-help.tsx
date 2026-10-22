"use client";

import { Kbd, KeyLabel } from "@/components/ui/kbd";
import { useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SHORTCUTS, useShortcut } from "@/lib/shortcuts";
import { cn } from "@/lib/utils";

// The "?" list of every shortcut, so they can be found without reading docs.
export function ShortcutsHelp({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  useShortcut("?", () => setOpen(true));
  return (
    <>
    {/* The list's own door, in the header: named like Settings beside it,
        with its key, so the bare "?" isn't read as About's shortcut. Only
        where there is a keyboard. */}
    <button
      type="button"
      onClick={() => setOpen(true)}
      aria-keyshortcuts="?"
      className={cn(className, "flex items-center gap-1.5 max-sm:hidden [@media(hover:none)]:hidden")}
    >
      Shortcuts
      <Kbd>?</Kbd>
    </button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>Single keys work when you are not typing in a field.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          {Object.entries(Object.groupBy(SHORTCUTS, (s) => s.screen)).map(([screen, list = []]) => (
              <section key={screen}>
                <h3 className="text-muted-foreground text-xs">{screen}</h3>
                <dl className="flex flex-col">
                  {list.map((s) => (
                    <div key={s.label} className="flex items-center justify-between gap-4 border-b py-2 text-sm last:border-b-0">
                      <dt>{s.label}</dt>
                      <dd className="flex shrink-0 gap-1">
                        {s.keys.map((k) => (
                          <Kbd key={k} className="text-muted-foreground">
                            <KeyLabel k={k} />
                          </Kbd>
                        ))}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}
