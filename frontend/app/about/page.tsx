import type { Metadata } from "next";
import Link from "next/link";

import { AppHeader } from "@/components/app-header";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { HowItWorks } from "@/components/how-it-works";
import { Logotype } from "@/components/brand";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "About - Thothly",
};

// What the old landing said around its search field, now that the field is the
// home page. A Server Component: only How it works (scroll reveal) and the
// header's theme toggle ship JS.
export default function AboutPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader />
      <main id="main" className="flex flex-1 flex-col">
        <section className="flex flex-col items-center gap-5 px-6 pt-16 pb-4 text-center sm:pt-20">
          <h1 className="font-display text-display leading-display tracking-tight text-balance sm:text-6xl">
            Make anything readable
          </h1>
          <p className="text-muted-foreground max-w-xl text-lg leading-snug text-balance sm:text-xl">
            Turn videos, podcasts, articles, even whole playlists into one clean
            read for your e-reader or your AI.
          </p>
          <Link href="/" className={buttonVariants({ className: "mt-2" })}>
            Start a compilation
          </Link>
        </section>
        <HowItWorks />
        <DataAndFaq />
      </main>
      <SiteFooter />
    </div>
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
          <Accordion className="mt-4">
            {items.map((it) => (
              <AccordionItem key={it.q} value={it.q}>
                <AccordionTrigger className="py-3.5">{it.q}</AccordionTrigger>
                <AccordionContent>
                  <p className="text-muted-foreground leading-relaxed text-balance">
                    {it.a}
                  </p>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </div>
    </section>
  );
}

const footerLink =
  "text-foreground hover:text-primary-strong focus-visible:ring-ring rounded-sm font-medium underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:outline-none";

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
            className={footerLink}
          >
            Wael
          </a>
          . Web search powered by{" "}
          {/* Brave's free monthly API credit requires this attribution. */}
          <a
            href="https://brave.com/search/api/"
            target="_blank"
            rel="noreferrer"
            className={footerLink}
          >
            Brave
          </a>
          .
        </span>
      </div>
    </footer>
  );
}
