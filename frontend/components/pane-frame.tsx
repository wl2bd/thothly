"use client";

import { Kbd } from "@/components/ui/kbd";
import type { ReactNode, Ref } from "react";
import { ArrowLeftIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// The right-hand pane's one grammar, whatever it holds: a header (the step as
// a small label, the title, one line of detail), the contents, and a footer
// whose primary action spans the width. Every step of a compilation and
// Settings use it, so the pane changes what it says, never its shape.
export function PaneFrame({
  eyebrow,
  title,
  onTitleChange,
  titleClassName,
  titleRef,
  meta,
  children,
  footer,
  footerRef,
  onBack,
}: {
  // Present: a Back link above the header, for a view that saves as it goes
  // and so has nothing to confirm (Settings).
  onBack?: () => void;
  eyebrow: ReactNode;
  title: string;
  // Present: the title is editable in place.
  onTitleChange?: (value: string) => void;
  titleClassName?: string;
  titleRef?: Ref<HTMLParagraphElement>;
  meta?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  footerRef?: Ref<HTMLDivElement>;
}) {
  return (
    <>
      <div className="flex flex-col gap-2 border-b px-6 py-6">
        {onBack && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onBack}
            aria-keyshortcuts="Escape"
            className="text-muted-foreground -mt-2 -ml-2.5 self-start"
          >
            <ArrowLeftIcon />
            Back
            <Kbd>Esc</Kbd>
          </Button>
        )}
        <h2 className="eyebrow flex items-center gap-2">{eyebrow}</h2>
        {onTitleChange ? (
          // The compilation's name, in its own voice, in the same field as
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
          <p
            ref={titleRef}
            tabIndex={titleRef ? -1 : undefined}
            className={cn("font-display text-xl tracking-tight text-balance outline-none", titleClassName)}
          >
            {title || "Untitled compilation"}
          </p>
        )}
        {meta && <span className="text-muted-foreground text-xs tabular-nums">{meta}</span>}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-6 py-6">{children}</div>

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
    </>
  );
}
