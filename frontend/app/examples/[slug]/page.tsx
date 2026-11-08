"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { notFound, useParams } from "next/navigation";

import { AppHeader } from "@/components/app-header";
import { BackLink } from "@/components/back-link";
import { BookActions, CopyMarkdownButton } from "@/components/book-actions";
import { BookContents, BookReader, MobileBookBar } from "@/components/book";
import { countWords, splitBook } from "@/lib/book-md";
import { CompilationPane, WorkPane, Workspace } from "@/components/compilation-pane";
import { buttonVariants } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EXAMPLES, type ExampleSlug } from "@/lib/examples";
import { cn } from "@/lib/utils";

export default function ExamplePage() {
  const { slug } = useParams<{ slug: string }>();
  if (!Object.hasOwn(EXAMPLES, slug)) notFound();
  const example: { title: string; view: "book" | "markdown" } = EXAMPLES[slug as ExampleSlug];

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
          {asBook && <MobileBookBar chapters={chapters} at={at} onGo={setAt} />}
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
          action={
            <Link
              href="/"
              className={cn(
                buttonVariants({ variant: "ghost", size: "sm" }),
                "text-muted-foreground -my-1.5 -mr-2.5",
              )}
            >
              Make your own
            </Link>
          }
          title={example.title}
          meta={`3 Wikipedia articles${words != null ? ` · ~${words.toLocaleString("en-US")} words` : ""}`}
          footer={
            <div className="flex flex-col gap-2">
              <div className="flex gap-3">
                <BookActions
                  epubUrl={epubUrl}
                  mdUrl={mdUrl}
                  title={example.title}
                  epubNote="For your e-reader"
                  mdNote="For your AI"
                />
                <CopyMarkdownButton md={md} />
              </div>
              <p className="text-muted-foreground text-xs">
                EPUB for your e-reader · Markdown for your AI
              </p>
            </div>
          }
        >
          {asBook ? (
            <BookContents chapters={chapters} at={at} onGo={setAt} className="max-lg:hidden" />
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
