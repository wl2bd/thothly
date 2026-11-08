"use client";

import { Kbd, KeyLabel } from "@/components/ui/kbd";
import { createContext, useContext, useEffect, useRef } from "react";
import { Popover } from "@base-ui/react/popover";
import katex from "katex";
import { ExternalLink } from "lucide-react";
import "katex/dist/katex.min.css";

import { Button } from "@/components/ui/button";
import { tokenizeInline, type InlineToken } from "@/lib/inline-md";
import { countWords, type Chapter } from "@/lib/book-md";
import { parseBlocks, type Block } from "@/lib/md-blocks";
import { hostOf } from "@/lib/url";
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
          {chapter.source && (
            <a
              href={chapter.source}
              target="_blank"
              rel="noreferrer"
              className="text-muted-foreground hover:text-foreground -mt-2 inline-flex w-fit items-center gap-1 text-xs transition-colors"
            >
              Open original on {hostOf(chapter.source)}
              <ExternalLink className="size-3" />
            </a>
          )}
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
// lib/inline-md: emphasis, links, code, sup/sub, math, footnote calls). It reads "$10 and $20"
// as prices the way Pandoc does, which a stock Markdown library would not.
// `reading`: the chapter in the reader, set for long reading (ink, 16px, open
// leading). Without it, a compact muted excerpt (the review preview).
export function MarkdownPreview({ md, reading = false }: { md: string; reading?: boolean }) {
  const all = parseBlocks(md);
  const notes = collectNotes(md, all);
  const flow = all.filter((b) => b.t !== "note");
  return (
    <Notes.Provider value={notes}>
    <div
      className={cn(
        "flex flex-col",
        reading
          ? "text-foreground gap-4 text-base leading-relaxed"
          : "text-muted-foreground gap-2 text-sm leading-relaxed",
      )}
    >
      {groupFigures(flow).map((block, i) =>
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
      {reading && notes.size > 0 && <NoteList notes={notes} />}
    </div>
    </Notes.Provider>
  );
}

// A chapter's footnotes by label, numbered in the order the text calls them.
type Note = { n: number; blocks: Block[] };
const Notes = createContext<Map<string, Note>>(new Map());

function collectNotes(md: string, blocks: Block[]): Map<string, Note> {
  const bodies = new Map<string, Block[]>();
  for (const b of blocks) if (b.t === "note") bodies.set(b.label, b.blocks);
  const notes = new Map<string, Note>();
  for (const m of md.matchAll(/\[\^([^\]\s]+)\](?!:)/g)) {
    const body = bodies.get(m[1]);
    if (body && !notes.has(m[1])) notes.set(m[1], { n: notes.size + 1, blocks: body });
  }
  return notes;
}

// The call: its number, opening the note beside the text (an e-reader's
// popup), so reading never jumps to the chapter's end.
function NoteRef({ label }: { label: string }) {
  const note = useContext(Notes).get(label);
  if (!note) return null;
  return (
    <Popover.Root>
      <Popover.Trigger
        aria-label={`Note ${note.n}`}
        className="text-link focus-visible:ring-ring -my-1 rounded-sm px-px align-super text-[0.7em] leading-none tabular-nums focus-visible:ring-2 focus-visible:outline-none"
      >
        {note.n}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="top" sideOffset={6} collisionPadding={16} className="z-50">
          <Popover.Popup
            className={cn(
              "bg-popover text-popover-foreground ring-foreground/10 flex max-h-72 w-[min(24rem,calc(100vw-2rem))] flex-col gap-2 overflow-y-auto rounded-md px-4 py-3 text-sm leading-relaxed shadow-lg ring-1",
              "origin-(--transform-origin) transition-[opacity,scale] duration-150 ease-out-quint data-[ending-style]:scale-97 data-[ending-style]:opacity-0 data-[starting-style]:scale-97 data-[starting-style]:opacity-0 motion-reduce:transition-opacity",
            )}
          >
            {note.blocks.map((b, i) => renderBlock(b, i, false))}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

// Every note again at the chapter's end, as a printed book sets them.
function NoteList({ notes }: { notes: Map<string, Note> }) {
  return (
    <section aria-label="Notes" className="border-foreground/10 mt-6 flex flex-col gap-3 border-t pt-6">
      <h3 className="eyebrow">Notes</h3>
      <ol className="text-muted-foreground flex flex-col gap-2 text-sm leading-relaxed">
        {[...notes.values()].map((note) => (
          <li key={note.n} className="flex gap-3">
            <span className="w-6 shrink-0 text-right tabular-nums">{note.n}</span>
            <div className="flex min-w-0 flex-col gap-2">{note.blocks.map((b, i) => renderBlock(b, i, false))}</div>
          </li>
        ))}
      </ol>
    </section>
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
        <blockquote key={key} className="border-foreground/20 text-muted-foreground flex flex-col gap-2 border-l-2 pl-4">
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
    case "note":
      return null; // set apart by MarkdownPreview
    case "table":
      // An all-blank header (a table with no <th> row at the source) is left out.
      // Rules drawn from the ink, not the UI's near-invisible --border: a firm
      // one under the header, faint ones between rows. The outer cells drop
      // their side padding so the table lines up with the text around it.
      return (
        <div key={key} className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            {block.head.some(Boolean) && (
              <thead>
                <tr>
                  {block.head.map((cell, j) => (
                    <th key={j} className="border-foreground/30 text-foreground border-b px-3 pb-2 align-bottom font-semibold first:pl-0 last:pr-0">
                      {renderInline(cell)}
                    </th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody>
              {block.rows.map((row, r) => (
                <tr key={r} className="border-foreground/10 border-b last:border-0">
                  {row.map((cell, j) => (
                    <td key={j} className="px-3 py-2.5 align-top first:pl-0 last:pr-0">
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
          // A long inline formula (a matrix, a sentence in \text) can't wrap
          // and would widen the whole page on a phone: it scrolls in its own
          // box instead. Short ones stay inline, on the text's baseline.
          className={cn(
            token.display
              ? "block max-w-full overflow-x-auto py-1"
              : token.tex.length > 40 && "inline-block max-w-full overflow-x-auto overflow-y-hidden py-0.5 align-middle",
          )}
          dangerouslySetInnerHTML={{
            __html: katex.renderToString(token.tex, { displayMode: token.display, throwOnError: false }),
          }}
        />
      );
    case "noteref":
      return <NoteRef key={key} label={token.label} />;
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
