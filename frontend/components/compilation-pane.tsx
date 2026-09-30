"use client";

import { ViewTransition, useEffect, useRef, useState, type ReactNode } from "react";

import { PaneFrame } from "@/components/pane-frame";
import { SettingsPaneContent } from "@/components/settings-pane";
import { useRegisterPane, useSettingsOpen, useWide } from "@/lib/settings-open";
import { cn } from "@/lib/utils";

// The right-hand pane of every screen of the flow: the compilation itself. The
// workspace fills it source by source, and the job page keeps it through
// discovery, review, compile and download, so the compilation never leaves its
// place. Same flow-card identity everywhere, so it morphs across the navigation
// instead of hard-cutting. Settings, when open, takes its place (see
// settings-pane.tsx); what the pane held stays mounted underneath, so nothing
// typed or picked is lost.
export function CompilationPane({
  eyebrow,
  title,
  onTitleChange,
  meta,
  children,
  footer,
  className,
  titleClassName,
}: {
  eyebrow: ReactNode;
  title: string;
  // Present: the title is editable in place.
  onTitleChange?: (value: string) => void;
  meta?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  className?: string;
  titleClassName?: string;
}) {
  useRegisterPane();
  const settingsOpen = useSettingsOpen();
  const wide = useWide();
  // In place only where the pane sits beside the work; on a phone Settings
  // opens full screen instead (settings-pane.tsx).
  const settings = settingsOpen && wide;
  // On a phone the footer is fixed to the screen's bottom edge, out of the
  // flow, so the pane reserves its height to keep the last content visible.
  const footerRef = useRef<HTMLDivElement>(null);
  const [footerHeight, setFooterHeight] = useState(0);
  useEffect(() => {
    const el = footerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setFooterHeight(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, [footer]);

  return (
    <ViewTransition name="flow-card">
      <aside
        aria-label={settings ? "Settings" : "Your compilation"}
        style={{ "--footer-h": `${footer ? footerHeight : 0}px` } as React.CSSProperties}
        className={cn(
          "bg-card flex min-h-0 flex-col border-t max-lg:flex-1 max-lg:pb-(--footer-h) lg:border-t-0 lg:border-l",
          className,
        )}
      >
        {settings && <SettingsPaneContent />}
        <div className={settings ? "hidden" : "contents"}>
          <PaneFrame
            eyebrow={eyebrow}
            title={title}
            onTitleChange={onTitleChange}
            titleClassName={titleClassName}
            meta={meta}
            footer={footer}
            footerRef={footerRef}
          >
            {children}
          </PaneFrame>
        </div>
      </aside>
    </ViewTransition>
  );
}

// The left-hand pane: whatever the current step is working on. Capped and
// centred so a wide screen doesn't stretch a row across 2000px.
export function WorkPane({
  children,
  className,
  label = "Contents",
}: {
  children: ReactNode;
  className?: string;
  label?: string;
}) {
  return (
    <section
      aria-label={label}
      className={cn("flex min-h-0 flex-1 flex-col lg:overflow-y-auto", className)}
    >
      <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col gap-6 p-4 sm:p-8">
        {children}
      </div>
    </section>
  );
}

// The two panes side by side, under the app header. Full viewport on a wide
// screen, each pane scrolling on its own; stacked on a phone.
export function Workspace({ children }: { children: ReactNode }) {
  return (
    <main
      id="main"
      // One column until a compilation pane is there to sit beside the work.
      className="flex min-h-0 flex-1 flex-col lg:grid lg:grid-cols-1 lg:has-[>aside]:grid-cols-[minmax(0,1fr)_400px]"
    >
      {children}
    </main>
  );
}
