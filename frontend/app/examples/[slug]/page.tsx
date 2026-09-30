"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { notFound, useParams } from "next/navigation";
import { Check, Copy } from "lucide-react";

import { AppHeader } from "@/components/app-header";
import { BackLink } from "@/components/back-link";
import { BookActions } from "@/components/book-actions";
import { BookContents, BookReader, countWords, splitBook } from "@/components/book";
import { CompilationPane, WorkPane, Workspace } from "@/components/compilation-pane";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// What a compilation gives, for each use on the home page: a real one, made by
// the app from three Wikipedia articles (free to republish) and shipped as
// files in /public/examples. The reading one opens as a book; the AI one shows
// the Markdown file exactly as an AI would get it.
const EXAMPLES: Record<string, { title: string; view: "book" | "markdown" }> = {
  stoicism: { title: "Stoicism", view: "book" },
  "how-transformers-work": { title: "How transformers work", view: "markdown" },
};

export default function ExamplePage() {
  const { slug } = useParams<{ slug: string }>();
  const example = EXAMPLES[slug];
  if (!example) notFound();

  const mdUrl = `/examples/${slug}.md`;
  const epubUrl = `/examples/${slug}.epub`;
  const [md, setMd] = useState<string | null>(null);
  const [at, setAt] = useState(0);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    fetch(mdUrl)
      .then((r) => r.text())
      .then(setMd)
      .catch(() => {});
  }, [mdUrl]);
  const chapters = useMemo(() => (md ? splitBook(md) : []), [md]);
  const words = md ? countWords(md) : null;

  async function copy() {
    if (!md) return;
    try {
      await navigator.clipboard.writeText(md);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked; the download remains */
    }
  }

  return (
    <div className="flex min-h-svh flex-col lg:h-svh">
      <AppHeader />
      <Workspace>
        <WorkPane label="Example">
          <BackLink href="/">Home</BackLink>
          {example.view === "book" ? (
            <BookReader chapters={chapters} at={at} onGo={setAt} />
          ) : (
            md && (
              <pre className="text-foreground/80 font-mono text-xs leading-relaxed whitespace-pre-wrap">
                {md}
              </pre>
            )
          )}
        </WorkPane>
        <CompilationPane
          eyebrow="Example"
          title={example.title}
          meta={`3 Wikipedia articles${words != null ? ` · ~${words.toLocaleString("en-US")} words` : ""}`}
          footer={
            <div className="flex flex-col gap-2">
              <div className="flex w-full gap-2">
                <BookActions
                  epubUrl={epubUrl}
                  mdUrl={mdUrl}
                  title={example.title}
                  epubNote="For your e-reader"
                  mdNote="For an AI"
                />
                <Button type="button" variant="outline" onClick={copy} disabled={!md}>
                  {copied ? <Check /> : <Copy />}
                  <span className="grid">
                    <span className={cn("col-start-1 row-start-1", copied && "invisible")}>Copy</span>
                    <span className={cn("col-start-1 row-start-1", !copied && "invisible")}>Copied</span>
                  </span>
                </Button>
              </div>
              <Link href="/" className={cn(buttonVariants({ variant: "ghost" }), "text-muted-foreground w-full")}>
                Make your own
              </Link>
            </div>
          }
        >
          {example.view === "book" ? (
            <BookContents chapters={chapters} at={at} onGo={setAt} />
          ) : (
            <p className="text-muted-foreground text-sm">
              The file as your AI gets it: one Markdown document, its sources listed first,
              each chapter marked with where it came from.
            </p>
          )}
        </CompilationPane>
      </Workspace>
    </div>
  );
}
