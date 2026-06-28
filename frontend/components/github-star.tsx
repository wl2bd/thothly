import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const REPO_URL = "https://github.com/wl2bd/thothly";

// Header CTA — star the repo on GitHub. A plain anchor styled as an outline
// button: no client JS and deliberately no network (we don't fetch a live star
// count, keeping the page keyless and zero-request). It took the theme toggle's
// spot in the header while the app is locked to dark.
//
// Treatment: a refined outline. A soft shadow lifts it off the header, and a
// gold wash arrives only on hover — the octocat warms to desert gold and the
// border picks up a faint gold rim. It stays subordinate to the gold-filled
// primary import CTA: gold is the reward for hovering here, not the resting
// state, so the page's one bold color still belongs to the main action.
export function GitHubStar({ className }: { className?: string }) {
  return (
    <a
      href={REPO_URL}
      target="_blank"
      rel="noreferrer noopener"
      aria-label="Star Thothly on GitHub"
      className={buttonVariants({
        variant: "outline",
        size: "sm",
        className: cn("shadow-sm shadow-black/5 hover:border-gold/40", className),
      })}
    >
      <GitHubMark className="text-muted-foreground transition-colors group-hover/button:text-gold" />
      Star
    </a>
  );
}

// Official GitHub mark. lucide-react dropped its brand icons (1.14), so the
// octocat lives here. The button's CVA sizes any unsized <svg> to size-4; the
// passed class only steers its color (muted at rest, gold on the button hover).
function GitHubMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  );
}
