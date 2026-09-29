"use client";

import { ViewTransition, type ReactNode } from "react";

import { AmbientBackground } from "@/components/ambient-background";
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
}) {
  return (
    <ViewTransition name="flow-card">
      <aside
        aria-label="Your compilation"
        className={cn(
          "bg-surface-sunken/75 flex min-h-0 flex-col border-t backdrop-blur-xl max-lg:flex-1 lg:border-t-0 lg:border-l",
          className,
        )}
      >
        {title !== undefined && (
          <div className="flex flex-col gap-2 border-b px-6 py-6">
            <h2 className="text-muted-foreground text-2xs flex items-center gap-2 font-medium tracking-wider uppercase">
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
                className="font-display h-12 text-xl md:text-xl"
              />
            ) : (
              <p className="font-display text-2xl tracking-tight text-balance">
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
          // pinned within reach of the thumb.
          <div className="flex flex-col gap-3 border-t px-6 py-5 max-lg:sticky max-lg:bottom-0">
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
      className="flex min-h-0 flex-1 flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_400px]"
    >
      <AmbientBackground />
      {children}
    </main>
  );
}
