import Link from "next/link";
import { SettingsIcon } from "lucide-react";

import { Logotype } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { buttonVariants } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";

// The one header of the workspace and its About page. Full width, because the
// workspace under it is: the logotype sits over the search pane's edge, the
// controls over the compilation's.
export function AppHeader() {
  return (
    <header className="bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky top-0 z-20 flex h-14 shrink-0 items-center justify-between border-b px-4 backdrop-blur sm:px-6">
      <Link href="/" className="flex items-center">
        <Logotype className="h-7 w-auto" title="Thothly" />
      </Link>
      <div className="flex items-center gap-1 sm:gap-2">
        <Link
          href="/about"
          className="text-muted-foreground hover:text-foreground px-2 text-sm transition-colors"
        >
          About
        </Link>
        <Tooltip content="Your models" side="bottom">
          <Link
            href="/settings"
            aria-label="Settings"
            className={buttonVariants({ variant: "nav", size: "icon-sm" })}
          >
            <SettingsIcon />
          </Link>
        </Tooltip>
        <ThemeToggle />
      </div>
    </header>
  );
}
