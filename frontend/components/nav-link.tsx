"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

// A header link that knows it is the current page: firmer ink, and
// aria-current for assistive tech. The compile flow counts every job page as
// its own, since that is where a compilation continues.
export function NavLink({
  href,
  alsoUnder,
  className,
  children,
}: {
  href: string;
  // Path prefixes that count as this page too ("/jobs/" for Compile).
  alsoUnder?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const current = pathname === href || (!!alsoUnder && pathname.startsWith(alsoUnder));
  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      className={cn(className, current && "text-foreground")}
    >
      {children}
    </Link>
  );
}
