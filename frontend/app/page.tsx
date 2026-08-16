import { ChevronDownIcon } from "lucide-react";

import { HeroSearch } from "@/components/hero-search";
import { HowItWorks } from "@/components/how-it-works";
import { Logotype } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";

// A Server Component: the page ships as HTML and hydrates only the islands it
// renders — the hero (search state), How it works (scroll reveal), and the
// header's theme toggle / GitHub star. Everything below is static markup that
// costs no client JS. Keep it that way: reach for a hook here and the whole
// landing turns back into one client bundle.
export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex flex-1 flex-col">
        <HeroSearch />
        <HowItWorks />
        <DataAndFaq />
      </main>
      <SiteFooter />
    </div>
  );
}

// ── Landing chrome ───────────────────────────────────────────────────────────

function SiteHeader() {
  return (
    <header className="bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky top-0 z-20 border-b backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-6">
        <Logotype className="h-7 w-auto" title="Thothly" />
        <div className="flex items-center gap-3 sm:gap-5">
          {/* Light anchor nav: the page is short, so this orients rather than
              structures. Hidden on narrow screens to keep the header to a
              logotype + one action. */}
          <nav className="hidden items-center gap-5 sm:flex">
            <HeaderLink href="#top">Start</HeaderLink>
            <HeaderLink href="#how-it-works">How it works</HeaderLink>
            <HeaderLink href="#faq">FAQ</HeaderLink>
          </nav>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}

function HeaderLink({ href, children }: { href: string; children: string }) {
  return (
    <a
      href={href}
      className="text-muted-foreground hover:text-foreground text-sm transition-colors"
    >
      {children}
    </a>
  );
}

function DataAndFaq() {
  const items = [
    {
      q: "What can I put in?",
      a: "Videos, podcasts, articles and blog posts. Drop a single link, or a whole playlist, channel or blog, and it expands into its items.",
    },
    {
      q: "Is it free?",
      a: "Yes. The default path uses no AI and costs nothing. Optional AI polish or podcast transcription only cost if you connect a paid provider, or stay free with a local one.",
    },
    {
      q: "Where do my files go?",
      a: "Onto the machine running Thothly, in a local file. The only things fetched are the sources themselves.",
    },
    {
      q: "A video has no subtitles?",
      a: "It's skipped, and you'll see that flagged in review before anything is compiled.",
    },
  ];
  return (
    <section id="faq" className="scroll-mt-14 border-t px-6 py-14">
      <div className="mx-auto grid w-full max-w-5xl gap-10 lg:grid-cols-2">
        <div>
          <h2 className="font-display text-2xl tracking-tight text-balance">
            Yours, on your machine
          </h2>
          <p className="text-muted-foreground mt-3 text-sm leading-relaxed text-balance">
            Thothly runs on your own machine. Your jobs and cached transcripts
            live in a single local file, nothing is sent to a server we run, and
            there is no tracking or analytics.
          </p>
          <ul className="text-muted-foreground marker:text-muted-foreground/40 mt-4 flex list-disc flex-col gap-2 pl-5 text-sm text-balance">
            <li>Free by default: the standard path uses no AI at all.</li>
            <li>
              AI polish is optional, and can run fully local (Ollama) or on a
              provider you choose.
            </li>
            <li>
              Paid steps like transcription only happen if you opt in, and are
              cached so a re-compile never pays twice.
            </li>
          </ul>
        </div>

        <div>
          <h2 className="font-display text-2xl tracking-tight text-balance">
            Questions
          </h2>
          {/* Native <details>: the disclosure is the browser's, so the FAQ needs
              no JS and stays server-rendered. */}
          <div className="mt-4 flex flex-col">
            {items.map((it) => (
              <details key={it.q} className="group border-b py-3.5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-medium [&::-webkit-details-marker]:hidden">
                  {it.q}
                  <ChevronDownIcon className="text-muted-foreground size-4 shrink-0 transition-transform group-open:rotate-180" />
                </summary>
                <p className="text-muted-foreground mt-2 text-sm leading-relaxed text-balance">
                  {it.a}
                </p>
              </details>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function SiteFooter() {
  return (
    <footer className="border-t px-6 py-8">
      <div className="text-muted-foreground mx-auto flex w-full max-w-5xl flex-col items-center justify-between gap-3 text-xs sm:flex-row">
        <Logotype className="text-foreground h-5 w-auto" title="Thothly" />
        <span>
          A personal reading compiler, built by{" "}
          <a
            href="https://wael.work"
            target="_blank"
            rel="noreferrer"
            className="text-foreground hover:text-gold focus-visible:ring-ring rounded-sm font-medium underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:outline-none"
          >
            Wael
          </a>
          .
        </span>
      </div>
    </footer>
  );
}
