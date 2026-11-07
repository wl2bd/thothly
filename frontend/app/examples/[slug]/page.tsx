"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { notFound, useParams } from "next/navigation";

import { AppHeader } from "@/components/app-header";
import { BackLink } from "@/components/back-link";
import { BookActions, CopyMarkdownButton } from "@/components/book-actions";
import { BookContents, BookReader } from "@/components/book";
import { countWords, splitBook } from "@/lib/book-md";
import { CompilationPane, WorkPane, Workspace } from "@/components/compilation-pane";
import { buttonVariants } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

// What a compilation gives, for each use on the home page: a real one, made by
// the app from three Wikipedia articles (free to republish) and shipped as
// files in /public/examples. The reading one opens as a book; the AI one shows
// the Markdown file exactly as an AI would get it, with a formatted view beside
// it, since raw Markdown doesn't show at a glance that the content came through.
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
  const [view, setView] = useState<"markdown" | "formatted">("markdown");
  const asBook = example.view === "book" || view === "formatted";
  useEffect(() => {
    fetch(mdUrl)
      .then((r) => r.text())
      .then(setMd)
      .catch(() => {});
  }, [mdUrl]);
  const chapters = useMemo(() => (md ? splitBook(md) : []), [md]);
  const words = md ? countWords(md) : null;

  return (
    <div className="flex min-h-svh flex-col lg:h-svh">
      <AppHeader />
      <Workspace>
        <WorkPane label="Example">
          <BackLink href="/">Home</BackLink>
          {example.view === "markdown" && (
            <Tabs value={view} onValueChange={(v) => setView(v as "markdown" | "formatted")}>
              <TabsList aria-label="View">
                <TabsTrigger value="markdown">Markdown</TabsTrigger>
                <TabsTrigger value="formatted">Formatted</TabsTrigger>
              </TabsList>
            </Tabs>
          )}
          {asBook ? (
            <BookReader chapters={chapters} at={at} onGo={setAt} />
          ) : (
            md && (
              <pre className="text-foreground min-w-0 font-mono text-xs leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere]">
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
              <BookActions
                epubUrl={epubUrl}
                mdUrl={mdUrl}
                title={example.title}
                epubNote="For your e-reader"
                mdNote="For an AI"
              />
              <div className="flex w-full gap-2">
                <CopyMarkdownButton md={md} />
                <Link href="/" className={cn(buttonVariants({ variant: "ghost" }), "text-muted-foreground flex-1")}>
                  Make your own
                </Link>
              </div>
              <p className="text-muted-foreground text-xs">
                The full compilation as Markdown, ready to paste into an AI.
              </p>
            </div>
          }
        >
          {asBook ? (
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
