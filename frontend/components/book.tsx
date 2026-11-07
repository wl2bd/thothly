"use client";

import { Kbd, KeyLabel } from "@/components/ui/kbd";
import { useEffect, useRef } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";

import { Button } from "@/components/ui/button";
import { tokenizeInline, type InlineToken } from "@/lib/inline-md";
import { countWords, type Chapter } from "@/lib/book-md";
import { parseBlocks, type Block } from "@/lib/md-blocks";
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
        <article className="flex max-w-prose flex-col gap-4 wrap-break-word">
          <h2 className="font-display text-3xl tracking-tight text-balance">
            {chapter.title}
          </h2>
          <MarkdownPreview md={chapter.body} reading />
        </article>
        {chapters.length > 1 && (
          <div className="flex justify-between gap-2">
            <Button type="button" variant="outline" disabled={at === 0} onClick={() => onGo(at - 1)}>
              <Kbd><KeyLabel k="←" /></Kbd>
              Previous
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={at >= chapters.length - 1}
              onClick={() => onGo(at + 1)}
            >
              Next
              <Kbd><KeyLabel k="→" /></Kbd>
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
                "hover:bg-muted/50 focus-visible:ring-ring flex w-full items-baseline gap-3 rounded-md px-2 py-1.5 text-left text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none",
                i === at ? "text-foreground font-medium" : "text-muted-foreground",
              )}
            >
              <span className="text-muted-foreground w-5 shrink-0 text-xs tabular-nums">
                {i + 1}
              </span>
              <span className="line-clamp-2 min-w-0 flex-1">{c.title}</span>
              <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                {countWords(c.body).toLocaleString("en-US")}
              </span>
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}

// A deliberately small Markdown renderer for the subset the compiler writes
// (lib/md-blocks: headings, fenced code, quotes, nested lists, tables, figures;
// lib/inline-md: emphasis, links, code, sup/sub, math). It reads "$10 and $20"
// as prices the way Pandoc does, which a stock Markdown library would not.
// `reading`: the chapter in the reader, set for long reading (ink, 16px, open
// leading). Without it, a compact muted excerpt (the review preview).
export function MarkdownPreview({ md, reading = false }: { md: string; reading?: boolean }) {
  return (
    <div
      className={cn(
        "flex flex-col",
        reading
          ? "text-foreground gap-4 text-base leading-relaxed"
          : "text-muted-foreground gap-2 text-sm leading-relaxed",
      )}
    >
      {groupFigures(parseBlocks(md)).map((block, i) =>
        Array.isArray(block) ? (
          // Figures in a row at the source (a gallery, an article's run of
          // examples) sit side by side, not stacked as a strip of thumbnails.
          <div key={i} className="grid grid-cols-1 items-start gap-x-4 gap-y-5 sm:grid-cols-2">
            {block.map((f, j) => (
              <figure key={j} className="flex flex-col gap-2">
                <FigureImage src={f.src} className="h-auto w-full" />
                {f.caption && <FigureCaption text={f.caption} />}
              </figure>
            ))}
          </div>
        ) : (
          renderBlock(block, i, reading)
        ),
      )}
    </div>
  );
}

type FigureBlock = Extract<Block, { t: "figure" }>;

// Runs of two or more figures become one group; everything else passes through.
function groupFigures(blocks: Block[]): (Block | FigureBlock[])[] {
  const out: (Block | FigureBlock[])[] = [];
  let run: FigureBlock[] = [];
  const flush = () => {
    if (run.length > 1) out.push(run);
    else out.push(...run);
    run = [];
  };
  for (const b of blocks) {
    if (b.t === "figure") run.push(b);
    else {
      flush();
      out.push(b);
    }
  }
  flush();
  return out;
}

// A faint rim: a photo shot on white would otherwise sit on the dark page
// like a sticker.
function FigureImage({ src, className }: { src: string; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- remote figures from the source, shown as-is
    <img
      src={src}
      alt=""
      loading="lazy"
      className={cn("ring-foreground/10 rounded-sm ring-1", className)}
    />
  );
}

// Set under its image, as wide as it and no wider, in the page's own muted
// voice: links stay links but drop the underline that made every name shout.
function FigureCaption({ text }: { text: string }) {
  return (
    <figcaption className="text-muted-foreground [contain:inline-size] text-sm leading-snug [&_a]:no-underline [&_a:hover]:underline">
      {renderInline(text)}
    </figcaption>
  );
}

function renderBlock(block: Block, key: number, reading: boolean): React.ReactNode {
  switch (block.t) {
    case "heading":
      return (
        <p key={key} className={cn("text-foreground font-semibold", reading ? "mt-4" : "mt-1")}>
          {renderInline(block.text)}
        </p>
      );
    case "paragraph":
      return <p key={key}>{renderInline(block.text)}</p>;
    case "code":
      return (
        <pre key={key} className="bg-muted overflow-x-auto rounded-sm px-3 py-2 font-mono text-[0.8em] leading-snug">
          <code>{block.text}</code>
        </pre>
      );
    case "quote":
      return (
        <blockquote key={key} className="border-border text-muted-foreground flex flex-col gap-2 border-l-2 pl-4">
          {block.blocks.map((b, i) => renderBlock(b, i, reading))}
        </blockquote>
      );
    case "list": {
      const List = block.ordered ? "ol" : "ul";
      return (
        <List key={key} className={cn("flex flex-col gap-1 pl-5", block.ordered ? "list-decimal" : "list-disc")}>
          {block.items.map((item, j) => (
            <li key={j}>
              {renderInline(item.text)}
              {item.blocks.length > 0 && (
                <div className="mt-1 flex flex-col gap-2">{item.blocks.map((b, i) => renderBlock(b, i, reading))}</div>
              )}
            </li>
          ))}
        </List>
      );
    }
    case "figure": {
      const img = <FigureImage src={block.src} className="max-h-96 max-w-full object-contain" />;
      // w-fit plus the caption's inline-size containment: the caption wraps at
      // the image's width instead of stretching the figure past it.
      return block.caption ? (
        <figure key={key} className="flex w-fit max-w-full flex-col gap-2 self-center">
          {img}
          <FigureCaption text={block.caption} />
        </figure>
      ) : (
        <div key={key} className="self-center">{img}</div>
      );
    }
    case "table":
      // An all-blank header (a table with no <th> row at the source) is left out.
      return (
        <div key={key} className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            {block.head.some(Boolean) && (
              <thead>
                <tr>
                  {block.head.map((cell, j) => (
                    <th key={j} className="border-border text-foreground border-b px-2 py-1.5 align-bottom font-semibold">
                      {renderInline(cell)}
                    </th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody>
              {block.rows.map((row, r) => (
                <tr key={r} className="border-border border-b last:border-0">
                  {row.map((cell, j) => (
                    <td key={j} className="px-2 py-1.5 align-top">
                      {renderInline(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }
}

function renderInline(text: string): React.ReactNode[] {
  return tokenizeInline(text).map(renderToken);
}

function renderToken(token: InlineToken, key: number): React.ReactNode {
  switch (token.t) {
    case "text":
      return token.text;
    case "strong":
      return <strong key={key}>{renderInline(token.text)}</strong>;
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
          {renderInline(token.text)}
        </a>
      );
    case "math":
      // KaTeX writes the TeX the compiler kept from the source; with its
      // defaults (no \href, no raw HTML) the markup it returns is safe.
      return (
        <span
          key={key}
          className={cn(token.display && "block max-w-full overflow-x-auto py-1")}
          dangerouslySetInnerHTML={{
            __html: katex.renderToString(token.tex, { displayMode: token.display, throwOnError: false }),
          }}
        />
      );
    case "sup":
      return <sup key={key}>{token.children.map(renderToken)}</sup>;
    case "sub":
      return <sub key={key}>{token.children.map(renderToken)}</sub>;
    case "code":
      return (
        <code key={key} className="bg-muted rounded px-1 text-[0.85em]">
          {token.text}
        </code>
      );
  }
}
