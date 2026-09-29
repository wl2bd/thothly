"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";

import { cn } from "@/lib/utils";

const style =
  "text-muted-foreground hover:text-foreground focus-visible:ring-ring -ml-0.5 inline-flex w-fit items-center gap-1.5 rounded-xs text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none";

// The one way back, the same everywhere: an arrow and a word, above the
// content it leaves. With `href` it goes there; without, it steps back in the
// tab's history, or home when the page was opened directly.
export function BackLink({
  href,
  onNavigate,
  children = "Back",
  className,
}: {
  href?: string;
  onNavigate?: () => void;
  children?: React.ReactNode;
  className?: string;
}) {
  const router = useRouter();
  const content = (
    <>
      <ArrowLeftIcon aria-hidden className="size-4" />
      {children}
    </>
  );
  if (href) {
    return (
      <Link href={href} onClick={onNavigate} className={cn(style, className)}>
        {content}
      </Link>
    );
  }
  return (
    <button
      type="button"
      onClick={() => (window.history.length > 1 ? router.back() : router.push("/"))}
      className={cn(style, className)}
    >
      {content}
    </button>
  );
}
