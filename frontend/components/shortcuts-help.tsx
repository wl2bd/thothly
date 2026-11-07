"use client";

import { Kbd, KeyLabel } from "@/components/ui/kbd";

import { PaneFrame } from "@/components/pane-frame";
import { setPaneView, usePaneView } from "@/lib/settings-open";
import { SHORTCUTS, useShortcut } from "@/lib/shortcuts";
import { cn } from "@/lib/utils";

// The list of every shortcut, in the side pane like Settings: Back (or
// Escape), and the work is where it was.
export function ShortcutsPaneContent({ titleRef }: { titleRef: React.Ref<HTMLHeadingElement> }) {
  return (
    <PaneFrame
      eyebrow="Shortcuts"
      title="Keyboard shortcuts"
      titleRef={titleRef}
      meta="Single keys work when you are not typing in a field."
      onBack={() => setPaneView(null)}
    >
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
    </PaneFrame>
  );
}

// The list's door, in the header beside Settings, named the same way and with
// its key, so the bare "?" isn't read as About's shortcut. Only where there is
// a keyboard.
export function ShortcutsHelp({ className }: { className?: string }) {
  const open = usePaneView() === "shortcuts";
  const toggle = () => setPaneView(open ? null : "shortcuts");
  useShortcut("?", toggle);
  return (
    <button
      type="button"
      onClick={toggle}
      aria-expanded={open}
      aria-keyshortcuts="?"
      className={cn(className, "flex items-center gap-1.5 max-sm:hidden [@media(hover:none)]:hidden", open && "text-foreground")}
    >
      Shortcuts
      <Kbd>?</Kbd>
    </button>
  );
}
