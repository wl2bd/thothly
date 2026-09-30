"use client";

import { Kbd } from "@/components/ui/kbd";
import { useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";
import { tokenizeInline, type InlineToken } from "@/lib/inline-md";
import { cn } from "@/lib/utils";

// A compiled book, read in the app: its contents, one chapter at a time, and
// the small Markdown renderer behind both. Shared by a finished compilation and
// the home page's examples.

// The whole compilation, readable right here, to check it before it goes to an
// e-reader or an AI. One chapter at a time: the heaviest book (every source at
// its cap) is tens of thousands of words, and one chapter renders instantly
// where the whole book would not. Open on the left pane; the
// downloads sit in the compilation pane.
export function BookReader({
  chapters,
  at,
  onGo,
}: {
  chapters: Chapter[];
  at: number;
  onGo: (i: number) => void;
}) {
  const topRef = useRef<HTMLDivElement>(null);
  // Every chapter change (the contents in the side pane, or Previous/Next)
  // brings the reader back to the chapter's top. Not on arrival.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    topRef.current?.scrollIntoView({ block: "start" });
  }, [at]);
  if (!chapters.length) return null;
  const chapter = chapters[Math.min(at, chapters.length - 1)];
  // Bottom room (pb-16) so Previous / Next never sit on the window's edge
  // once scrolled to the end: a scroll box drops its own bottom padding.
  return (
    <div ref={topRef} className="flex scroll-mt-20 flex-col gap-6 pb-16">
        <span className="text-muted-foreground text-xs tabular-nums">
          Chapter {at + 1} of {chapters.length}
        </span>
        <article className="flex max-w-prose flex-col gap-4">
          <h2 className="font-display text-3xl tracking-tight text-balance">
            {chapter.title}
          </h2>
          <MarkdownPreview md={chapter.body} reading />
        </article>
        {chapters.length > 1 && (
          <div className="flex justify-between gap-2">
            <Button type="button" variant="outline" disabled={at === 0} onClick={() => onGo(at - 1)}>
              <Kbd>←</Kbd>
              Previous
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={at >= chapters.length - 1}
              onClick={() => onGo(at + 1)}
            >
              Next
              <Kbd>→</Kbd>
            </Button>
          </div>
        )}
    </div>
  );
}

// The book's contents in the side pane, next to the downloads: every chapter
// with its length, the one open in the reader marked. Picking one opens it.
export function BookContents({
  chapters,
  at,
  onGo,
}: {
  chapters: Chapter[];
  at: number;
  onGo: (i: number) => void;
}) {
  if (chapters.length < 2) return null;
  return (
    <nav aria-label="Contents" className="flex flex-col gap-2">
      <h3 className="eyebrow">
        Contents
      </h3>
      <ol className="-mx-2 flex flex-col">
        {chapters.map((c, i) => (
          <li key={i} className="line-in" style={{ "--i": i } as React.CSSProperties}>
            <button
              type="button"
              onClick={() => onGo(i)}
              aria-current={i === at ? "true" : undefined}
              className={cn(
                "hover:bg-foreground/5 focus-visible:ring-ring flex w-full items-baseline gap-3 rounded-md px-2 py-1.5 text-left text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none",
                i === at ? "text-foreground font-medium" : "text-muted-foreground",
              )}
            >
              <span className="text-muted-foreground/70 w-5 shrink-0 text-xs tabular-nums">
                {i + 1}
              </span>
              <span className="line-clamp-2 min-w-0 flex-1">{c.title}</span>
              <span className="text-muted-foreground/70 shrink-0 text-xs tabular-nums">
                {countWords(c.body).toLocaleString("en-US")}
              </span>
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}

export type Chapter = { title: string; body: string };

// A book H1 as the compiler writes it: the title, then optional Pandoc
// attributes ("{lang=fr}" on a chapter, "{.front-matter}" on the Sources index
// and the preface, whose headings are in the book's language). Books compiled
// before the marker existed are recognised by their English headings.
function parseHeading(text: string): { title: string; frontMatter: boolean } {
  const m = /^(.*?)\s*\{([^{}]*)\}\s*$/.exec(text);
  const title = (m ? m[1] : text).trim();
  const attrs = m ? m[2] : "";
  return {
    title,
    frontMatter:
      attrs.includes(".front-matter") ||
      (!m && (title === "Sources" || title === "Preface")),
  };
}

// The book's Markdown as {title, body} per H1, the way the backend's
// `split_chapters` reads it. The "Sources" index is navigation, not reading;
// the source-attribution block (`:::`) is the compiler's, not the text.
export function splitBook(md: string): Chapter[] {
  const out: { title: string; frontMatter: boolean; body: string[] }[] = [];
  let fenced = false;
  // A book written on Windows comes back with CRLF; a stray "\r" defeats every
  // "$"-anchored pattern downstream.
  for (const line of md.replace(/\r\n?/g, "\n").split("\n")) {
    const h1 = /^#\s+(.*)/.exec(line);
    if (h1) {
      out.push({ ...parseHeading(h1[1]), body: [] });
      continue;
    }
    if (line.trim().startsWith(":::")) {
      fenced = !fenced;
      continue;
    }
    if (!fenced) out[out.length - 1]?.body.push(line);
  }
  return out
    .filter((c) => !c.frontMatter)
    .map((c) => ({ title: c.title, body: c.body.join("\n").trim() }));
}

export function countWords(text: string): number {
  const t = text.trim();
  return t ? t.split(/\s+/).length : 0;
}

// A deliberately small Markdown renderer for the narrow subset the compiler
// emits (## headings, **bold** speaker labels, bullet lists, links). Avoids
// pulling in a Markdown dependency for what is just a read-only preview.
// `reading`: the chapter in the reader, set for long reading (ink, 16px, open
// leading). Without it, a compact muted excerpt (the review preview).
export function MarkdownPreview({ md, reading = false }: { md: string; reading?: boolean }) {
  // A heading line is its own block even with no blank line around it: the
  // "sections" pass often writes "## Title\nFirst sentence…".
  const blocks = md
    .split(/\n{2,}|\n(?=#{1,6}\s)|(?<=^#{1,6}\s[^\n]*)\n/m)
    .filter((b) => b.trim());
  return (
    <div
      className={cn(
        "flex flex-col",
        reading
          ? "text-foreground gap-4 text-base leading-[1.65]"
          : "text-muted-foreground gap-2 text-sm leading-relaxed",
      )}
    >
      {blocks.map((block, i) => {
        const image = /^!\[([^\]]*)\]\((\S+?)\)\s*$/.exec(block.trim());
        if (image) {
          // eslint-disable-next-line @next/next/no-img-element -- remote figures from the source, shown as-is
          return <img key={i} src={image[2]} alt={image[1]} loading="lazy" className="max-h-80 max-w-full rounded-sm object-contain" />;
        }
        const heading = /^(#{1,6})\s+(.*)$/.exec(block);
        if (heading) {
          return (
            <p key={i} className={cn("text-foreground font-semibold", reading ? "mt-4" : "mt-1")}>
              {renderInline(heading[2])}
            </p>
          );
        }
        if (/^\s*[-*]\s+/.test(block)) {
          const lines = block.split("\n").map((l) => l.replace(/^\s*[-*]\s+/, ""));
          return (
            <ul key={i} className="list-disc pl-5">
              {lines.map((line, j) => (
                <li key={j}>{renderInline(line)}</li>
              ))}
            </ul>
          );
        }
        return <p key={i}>{renderInline(block.replace(/\n/g, " "))}</p>;
      })}
    </div>
  );
}

function renderInline(text: string): React.ReactNode[] {
  return tokenizeInline(text).map(renderToken);
}

function renderToken(token: InlineToken, key: number): React.ReactNode {
  switch (token.t) {
    case "text":
      return token.text;
    case "strong":
      return <strong key={key}>{token.text}</strong>;
    case "em":
      return <em key={key}>{token.children.map(renderToken)}</em>;
    case "link":
      return (
        <a
          key={key}
          href={token.href}
          target="_blank"
          rel="noreferrer"
          className="text-link"
        >
          {token.text}
        </a>
      );
    case "code":
      return (
        <code key={key} className="bg-muted rounded px-1 text-[0.85em]">
          {token.text}
        </code>
      );
  }
}
