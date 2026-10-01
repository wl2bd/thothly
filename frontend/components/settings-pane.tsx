"use client";

import { Kbd } from "@/components/ui/kbd";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";

import { ModelSettingsPanel } from "@/components/connect-model";
import { PaneFrame } from "@/components/pane-frame";
import { setSettingsOpen, usePaneCount, useSettingsOpen, useWide } from "@/lib/settings-open";
import { useShortcut } from "@/lib/shortcuts";
import { cn } from "@/lib/utils";

const close = () => setSettingsOpen(false);

// Settings, in the pane's own shape. Set once and rarely touched again, so it
// takes the compilation pane's place instead of a page of its own: Back, and
// the work is where it was.
export function SettingsPaneContent() {
  const titleRef = useRef<HTMLHeadingElement>(null);
  // Focus lands on the pane's title, so a keyboard or screen reader follows
  // the swap; Escape closes, like any panel.
  useEffect(() => {
    titleRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <PaneFrame
      eyebrow="Settings"
      title="AI models"
      titleRef={titleRef}
      // Every change is saved as it is made, so there is nothing to confirm:
      // Back, not Done.
      meta="Optional. Saved as you go, in this browser."
      onBack={close}
    >
      <details className="text-muted-foreground -mt-2 text-xs">
        <summary className="hover:text-foreground w-fit cursor-pointer underline decoration-current/35 underline-offset-3">
          How keys are used
        </summary>
        <p className="mt-1.5">
          Thothly sends your key to your provider only to check it and to run a compilation you
          start. It never stores it.
        </p>
      </details>
      <ModelSettingsPanel />
    </PaneFrame>
  );
}

// The header's Settings link, and the stand-alone pane for when there is no
// compilation pane to turn over (a page without one, or a phone, where the
// pane sits out of sight under the work).
export function SettingsLink({ className }: { className?: string }) {
  const open = useSettingsOpen();
  const panes = usePaneCount();
  const wide = useWide();
  const pathname = usePathname();

  // Settings belongs to the screen it was opened on.
  useEffect(() => {
    setSettingsOpen(false, false);
  }, [pathname]);
  useShortcut(",", () => setSettingsOpen(!open));

  const standalone = open && (panes === 0 || !wide);
  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        aria-keyshortcuts=","
        onClick={() => setSettingsOpen(!open)}
        className={cn(className, "flex items-center gap-1.5", open && "text-foreground")}
      >
        Settings
        <Kbd className="max-sm:hidden">,</Kbd>
      </button>
      {/* Portalled to the body: the header's backdrop blur would otherwise
          trap a fixed panel inside its 56px. */}
      {standalone &&
        createPortal(
        <aside
          data-pane
          aria-label="Settings"
          className="bg-card fixed inset-x-0 top-header bottom-0 z-30 flex flex-col border-t lg:left-auto lg:w-pane lg:border-t-0 lg:border-l"
        >
          <SettingsPaneContent />
        </aside>,
        document.body,
      )}
    </>
  );
}
