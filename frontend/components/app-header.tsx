import Link from "next/link";

import { Logotype } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";

const navLink =
  "text-muted-foreground hover:text-foreground px-2 text-sm transition-colors";

// The one header of every page: the workspace, the model and About. Full width, because the
// workspace under it is: the logotype sits over the search pane's edge, the
// controls over the compilation's.
export function AppHeader() {
  return (
    <header className="bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky top-0 z-20 flex h-14 shrink-0 items-center justify-between border-b px-4 backdrop-blur sm:px-6">
      <Link href="/" className="flex items-center">
        <Logotype className="h-7 w-auto" title="Thothly" />
      </Link>
      <div className="flex items-center gap-1 sm:gap-2">
        {/* Words, not a gear: nobody guesses that a cog holds their AI key. */}
        <Link href="/settings" className={navLink}>
          AI model
        </Link>
        <Link href="/about" className={navLink}>
          About
        </Link>
        <ThemeToggle />
      </div>
    </header>
  );
}
