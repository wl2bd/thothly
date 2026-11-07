"use client";

import { Toaster } from "@/components/ui/sonner";
import { usePaneCount, useWide } from "@/lib/settings-open";

const UNDER_HEADER = "calc(var(--spacing-header) + 0.75rem)";

// Where a toast lands. Toasts are passing feedback on the main content, not
// alerts (those sit at the top of their area), so on a wide screen they keep to
// the bottom-right corner of the work column, clear of the compilation pane.
// On a phone the bottom edge holds the pinned action bar, so they drop in under
// the header instead.
export function AppToaster() {
  const wide = useWide();
  const pane = usePaneCount() > 0;
  if (!wide) {
    return <Toaster position="top-center" offset={{ top: UNDER_HEADER }} mobileOffset={{ top: UNDER_HEADER }} />;
  }
  return (
    <Toaster
      position="bottom-right"
      offset={{ bottom: "1.5rem", right: pane ? "calc(var(--container-pane) + 1.5rem)" : "1.5rem" }}
    />
  );
}
