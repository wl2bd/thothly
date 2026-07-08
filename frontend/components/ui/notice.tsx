import type { ComponentProps } from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { CircleAlertIcon, InfoIcon, TriangleAlertIcon } from "lucide-react"

import { cn } from "@/lib/utils"

// One inline message treatment for every banner-level notice, so a given
// severity looks the same wherever it appears (home + job error banners, the
// search degraded-provider notice). The colour carries the nature; the leading
// icon makes it readable at a glance. Semantic tokens only (see badge.tsx) so
// it re-skins with the theme. Per-item micro-notes (a preview caveat, a
// truncation line) stay as plain coloured text — this box is for banners.
const noticeVariants = cva(
  "flex items-start gap-2.5 rounded-lg px-4 py-3 text-sm leading-relaxed [&>svg]:mt-0.5 [&>svg]:size-4 [&>svg]:shrink-0",
  {
    variants: {
      variant: {
        error: "bg-destructive/10 text-destructive dark:bg-destructive/20",
        warning: "bg-warning/10 text-warning dark:bg-warning/20",
        info: "bg-info/10 text-info dark:bg-info/20",
      },
    },
    defaultVariants: {
      variant: "error",
    },
  },
)

const noticeIcon = {
  error: CircleAlertIcon,
  warning: TriangleAlertIcon,
  info: InfoIcon,
} as const

function Notice({
  className,
  variant = "error",
  children,
  ...props
}: ComponentProps<"div"> & VariantProps<typeof noticeVariants>) {
  const resolved = variant ?? "error"
  const Icon = noticeIcon[resolved]
  return (
    <div
      // Errors interrupt (assertive); softer notices announce politely.
      role={resolved === "error" ? "alert" : "status"}
      className={cn(noticeVariants({ variant }), className)}
      {...props}
    >
      <Icon aria-hidden="true" />
      <span>{children}</span>
    </div>
  )
}

export { Notice, noticeVariants }
