"use client";

import { ViewTransition, useEffect, useRef, useState, type ReactNode } from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// The right-hand pane of every screen of the flow: the compilation itself. The
// workspace fills it source by source, and the job page keeps it through
// discovery, review, compile and download, so the book never leaves its place.
// Same flow-card identity everywhere, so it morphs across the navigation
// instead of hard-cutting.
export function CompilationPane({
  title,
  onTitleChange,
  meta,
  eyebrow = "Your compilation",
  children,
  footer,
  className,
  titleClassName,
}: {
  // Absent: no header at all (the empty workspace shows its history instead).
  title?: string;
  // Present: the title is editable in place.
  onTitleChange?: (value: string) => void;
  meta?: ReactNode;
  eyebrow?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  className?: string;
  titleClassName?: string;
}) {
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
        aria-label="Your compilation"
        style={{ "--footer-h": `${footer ? footerHeight : 0}px` } as React.CSSProperties}
        className={cn(
          "bg-card flex min-h-0 flex-col border-t max-lg:flex-1 max-lg:pb-(--footer-h) lg:border-t-0 lg:border-l",
          className,
        )}
      >
        {title !== undefined && (
          <div className="flex flex-col gap-2 border-b px-6 py-6">
            <h2 className="eyebrow flex items-center gap-2">
              {eyebrow}
            </h2>
            {onTitleChange ? (
              // The book's name, in the book's voice, in the same field as
              // every other input.
              <Input
                value={title}
                onChange={(e) => onTitleChange(e.target.value)}
                placeholder="Untitled compilation"
                aria-label="Compilation title"
                maxLength={100}
                className="font-display text-xl md:text-xl"
              />
            ) : (
              <p className={cn("font-display text-xl tracking-tight text-balance", titleClassName)}>
                {title || "Untitled compilation"}
              </p>
            )}
            {meta && (
              <span className="text-muted-foreground text-xs tabular-nums">
                {meta}
              </span>
            )}
          </div>
        )}

        <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-6 py-6">
          {children}
        </div>

        {footer && (
          // On a phone the pane sits under a long list, so its action stays
          // pinned to the bottom of the screen, within reach of the thumb.
          <div
            ref={footerRef}
            className="bg-card flex flex-col gap-3 border-t px-6 py-5 max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 max-lg:z-20 max-lg:pb-[max(1.25rem,env(safe-area-inset-bottom))]"
          >
            {footer}
          </div>
        )}
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
