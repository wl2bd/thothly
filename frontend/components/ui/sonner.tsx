"use client"

import { Toaster as Sonner, type ToasterProps } from "sonner"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

// Colours come from our own tokens (below), which follow the .dark class the
// theme toggle sets, so Sonner needs no theme provider of its own.
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      icons={{
        success: (
          <CircleCheckIcon className="size-4" />
        ),
        info: (
          <InfoIcon className="size-4" />
        ),
        warning: (
          <TriangleAlertIcon className="size-4" />
        ),
        error: (
          <OctagonXIcon className="size-4" />
        ),
        loading: (
          <Loader2Icon className="size-4 animate-spin" />
        ),
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast",
          // Sonner's own description grey is for its light theme only.
          description: "text-muted-foreground!",
          // The kit's outline button. Sonner styles [data-button] with a
          // stronger selector (an inverted 24px chip), so the clashing
          // properties need the important flag.
          actionButton: cn(
            buttonVariants({ variant: "outline", size: "sm" }),
            "h-8! rounded-[min(var(--radius-md),12px)]! border! border-border! bg-field! px-3! text-sm! text-foreground! hover:bg-field-hover! focus-visible:border-ring! focus-visible:ring-3! focus-visible:ring-ring/50! dark:border-input!"
          ),
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
