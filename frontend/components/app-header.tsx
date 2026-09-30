import Link from "next/link";

import { SettingsLink } from "@/components/settings-pane";
import { NavLink } from "@/components/nav-link";
import { ShortcutsHelp } from "@/components/shortcuts-help";
import { Logotype } from "@/components/brand";
import { version } from "@/package.json";
import { ThemeToggle } from "@/components/theme-toggle";

const navLink =
  "text-muted-foreground hover:text-foreground px-2 text-sm transition-colors";

// The one header of every page: the workspace, the model and About. Full width, because the
// workspace under it is: the logotype sits over the search pane's edge, the
// controls over the compilation's.
export function AppHeader() {
  return (
    <header className="bg-card/95 supports-[backdrop-filter]:bg-card/80 sticky top-0 z-20 flex h-14 shrink-0 items-center justify-between border-b px-4 backdrop-blur sm:px-6">
      <Link href="/" className="flex items-end gap-1.5">
        <Logotype className="h-7 w-auto" title="Thothly" />
        {/* The build's version, from package.json: bumped there, shown here. */}
        <span className="text-muted-foreground mb-0.5 text-xs tabular-nums">v{version}</span>
      </Link>
      <div className="flex items-center gap-1 sm:gap-2">
        {/* The way back to the work from anywhere, beside the logo that does
            the same for those who know it. */}
        <NavLink href="/" alsoUnder="/jobs/" className={navLink}>
          Compile
        </NavLink>
        {/* Words, not a gear: nobody guesses that a cog holds their AI key. */}
        <SettingsLink className={navLink} />
        <NavLink href="/about" className={navLink}>
          About
        </NavLink>
        <ShortcutsHelp />
        <ThemeToggle />
      </div>
    </header>
  );
}
