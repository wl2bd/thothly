import type { ComponentProps } from "react"
import { CircleAlertIcon, InfoIcon, TriangleAlertIcon } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { cn } from "@/lib/utils"

// Our three banner severities, drawn with shadcn's Alert so every message box
// is the kit's own. The colour carries the nature; the icon makes it readable
// at a glance. Per-item micro-notes stay plain coloured text.
const tone = {
  error: "text-destructive *:data-[slot=alert-description]:text-destructive/90",
  warning: "text-warning *:data-[slot=alert-description]:text-warning/90",
  info: "text-info *:data-[slot=alert-description]:text-info/90",
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
      className={cn("px-4 py-3", tone[variant], className)}
      {...props}
    >
      <Icon aria-hidden="true" />
      <AlertDescription className="text-pretty">{children}</AlertDescription>
    </Alert>
  )
}

export { Notice }
