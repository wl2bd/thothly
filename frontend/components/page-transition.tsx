"use client";

import { ViewTransition } from "react";
import { usePathname } from "next/navigation";

// Every route change cross-fades, not only the ones that carry the flow-card
// (About, the examples). Keyed by path so the old page exits and the new one
// enters as two snapshots, each at its own size; in-page transitions (the
// card's phases) leave it alone.
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <ViewTransition key={pathname} enter="page" exit="page" default="none">
      {children}
    </ViewTransition>
  );
}
