import { ViewTransition } from "react";
import Link from "next/link";

import { SettingsLink } from "@/components/settings-pane";
import { NavLink } from "@/components/nav-link";
import { ShortcutsHelp } from "@/components/shortcuts-help";
import { Logotype } from "@/components/brand";
import { version } from "@/package.json";
import { ThemeToggle } from "@/components/theme-toggle";

const navLink =
  "text-muted-foreground hover:text-foreground px-2 py-2 text-sm transition-colors";

// The one header of every page: the workspace, the model and About. Full width, because the
// workspace under it is: the logotype sits over the search pane's edge, the
// controls over the compilation's.
export function AppHeader() {
  return (
    // Named so a page change leaves it in place (globals.css, site-header).
    <ViewTransition name="site-header">
    <header className="bg-card/95 supports-[backdrop-filter]:bg-card/80 sticky top-0 z-20 flex h-header shrink-0 items-center justify-between border-b px-6 backdrop-blur">
      <Link href="/" className="flex items-end gap-1.5">
        <Logotype className="h-7 w-auto" title="Thothly" />
        {/* The build's version, from package.json: bumped there, shown here. */}
        <span className="text-muted-foreground mb-0.5 text-xs tabular-nums max-sm:hidden">v{version}</span>
      </Link>
      <div className="flex items-center gap-1 sm:gap-2">
        {/* Words, not a gear: nobody guesses that a cog holds their AI key. */}
        <SettingsLink className={navLink} />
        {/* The two with a key sit together; About has none. */}
        <ShortcutsHelp className={navLink} />
        <NavLink href="/about" className={navLink}>
          About
        </NavLink>
        <a
          href="https://github.com/wl2bd/thothly"
          target="_blank"
          rel="noreferrer"
          aria-label="Star Thothly on GitHub"
          className={`${navLink} flex items-center gap-1.5`}
        >
          <GitHubMark className="size-4" />
          <span className="max-sm:hidden">Star</span>
        </a>
        <ThemeToggle />
      </div>
    </header>
    </ViewTransition>
  );
}

// GitHub's mark (Simple Icons); lucide no longer ships brand icons.
function GitHubMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  );
}
