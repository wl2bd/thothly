import type { Metadata } from "next";

import { AppHeader } from "@/components/app-header";
import { BackLink } from "@/components/back-link";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

export const metadata: Metadata = {
  title: "About - Thothly",
};

// A side page, not a hidden landing: the workspace's header, one reading
// column, plain text. The home page is the tool; this only answers questions.
export default function AboutPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader />
      <main
        id="main"
        className="mx-auto flex w-full max-w-xl flex-col gap-10 px-4 py-12 sm:px-6"
      >
        <section className="flex flex-col gap-3">
          <BackLink className="mb-3" />
          <h1 className="font-display text-3xl tracking-tight">About</h1>
          <p className="text-muted-foreground leading-relaxed">
            Thothly turns videos, podcasts and articles into one clean read: an
            EPUB for your e-reader, or a Markdown file for your AI.
          </p>
        </section>

        <section id="how-it-works" className="flex scroll-mt-20 flex-col gap-3">
          <h2 className="font-display text-xl tracking-tight">How it works</h2>
          <ol className="text-muted-foreground flex list-decimal flex-col gap-2 pl-5 leading-relaxed">
            <li>Search, or paste a link. Add up to 5 sources.</li>
            <li>Pick the chapters you want from each source.</li>
            <li>Compile, then read it here or download it.</li>
          </ol>
        </section>

        {/* Only what is true of the hosted demo (checked 2026-11-08): the
            server counts anonymous events (PostHog, numbers and types only,
            never a query, URL or title: backend/app/core/posthog.py), history
            and keys in localStorage, no volume on Fly. */}
        <section id="privacy" className="flex scroll-mt-20 flex-col gap-3">
          <h2 className="font-display text-xl tracking-tight">Privacy</h2>
          <ul className="text-muted-foreground flex list-disc flex-col gap-2 pl-5 leading-relaxed">
            <li>
              No account, no ads, no tracking across sites. The server counts
              anonymous usage, numbers only: never your searches, links or
              titles.
            </li>
            <li>
              Your compilation history and your AI key stay in this browser.
            </li>
            <li>
              Searching and compiling run on our server. Your searches go to
              the services that search the web, YouTube and podcasts, and to a
              model that sorts the results.
            </li>
            <li>
              Finished files wait on the server for you to download them, and
              are wiped whenever it restarts. The host keeps short technical
              logs of requests.
            </li>
          </ul>
        </section>

        <section className="flex flex-col gap-1">
          <h2 className="font-display text-xl tracking-tight">Questions</h2>
          <Accordion>
            {faq.map((it) => (
              <AccordionItem key={it.q} value={it.q}>
                <AccordionTrigger className="py-3.5">{it.q}</AccordionTrigger>
                <AccordionContent>
                  <p className="text-muted-foreground leading-relaxed">{it.a}</p>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </section>

        <p className="text-muted-foreground border-t pt-6 text-xs">
          Built by{" "}
          <a href="https://wael.work" target="_blank" rel="noreferrer" className={link}>
            Wael
          </a>
          .
        </p>
      </main>
    </div>
  );
}

const faq = [
  {
    q: "What can I put in?",
    a: "Videos, podcasts, articles and blog posts. A single link, or a whole playlist, channel or blog, which opens into its videos, episodes or posts.",
  },
  {
    q: "Is it free?",
    a: "Yes. The default path is free. AI polish and podcast transcription are optional; with your own key, their cost goes straight to your provider.",
  },
  {
    q: "Where does my AI key go?",
    a: "It stays in this browser, and is only sent along with the requests that use your model.",
  },
  {
    q: "A video has no transcript?",
    a: "It's flagged before you compile, and left out of the compilation.",
  },
];

const link = "text-foreground text-link";
