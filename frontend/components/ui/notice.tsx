import type { ComponentProps } from "react"
import { CircleAlertIcon, InfoIcon, TriangleAlertIcon } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { cn } from "@/lib/utils"

// Our three banner severities, drawn with shadcn's Alert so every message box
// is the kit's own. The colour carries the nature; the icon makes it readable
// at a glance. Per-item micro-notes stay plain coloured text.
const tone = {
  error: "destructive",
  // Conventional status colours, so a warning reads as one at a glance
  // (Wael, 2026-10-22, reversing the neutral notices of 2026-09-28).
  warning: "warning",
  info: "info",
} as const

const icon = {
  error: CircleAlertIcon,
  warning: TriangleAlertIcon,
  info: InfoIcon,
} as const

function Notice({
  className,
  variant = "error",
  children,
  ...props
}: ComponentProps<"div"> & { variant?: keyof typeof tone }) {
  const Icon = icon[variant]
  return (
    <Alert
      // Errors interrupt (assertive); softer notices announce politely.
      role={variant === "error" ? "alert" : "status"}
      variant={tone[variant]}
      className={cn("px-4 py-3", className)}
      {...props}
    >
      <Icon aria-hidden="true" />
      <AlertDescription className="min-w-0 text-pretty">{children}</AlertDescription>
    </Alert>
  )
}

export { Notice }
