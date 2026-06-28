"use client";

import * as React from "react";
import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";

import { cn } from "@/lib/utils";

// A discreet hover/focus tooltip for icon-only controls. The single child
// (typically a Button) becomes the trigger via base-ui's `render` prop, so the
// real control stays focusable and the tip also shows on keyboard focus — the
// accessible name still lives on the control's own aria-label; this is the
// description. Portalled so it escapes the row's overflow-hidden clipping.
function Tooltip({
  content,
  children,
  side = "top",
  sideOffset = 6,
  delay = 350,
  className,
}: {
  content: React.ReactNode;
  children: React.ReactElement;
  side?: "top" | "right" | "bottom" | "left";
  sideOffset?: number;
  delay?: number;
  className?: string;
}) {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger delay={delay} render={children} />
      <TooltipPrimitive.Portal>
        {/* z-index lives on the positioned element (the Positioner), not the
            Popup: a z-auto positioner is painted under any z-indexed element
            (e.g. the sticky "Deselect" bar at z-10), which clipped the tip. */}
        <TooltipPrimitive.Positioner
          side={side}
          sideOffset={sideOffset}
          className="z-50"
        >
          <TooltipPrimitive.Popup
            className={cn(
              "bg-foreground text-background max-w-56 rounded-md px-2 py-1 text-xs font-medium shadow-md select-none",
              "transition-opacity data-[ending-style]:opacity-0 data-[starting-style]:opacity-0",
              className,
            )}
          >
            {content}
          </TooltipPrimitive.Popup>
        </TooltipPrimitive.Positioner>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}

export { Tooltip };
