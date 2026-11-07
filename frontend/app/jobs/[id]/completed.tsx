import { useEffect, useMemo, useState, type CSSProperties } from "react";
import Link from "next/link";
import { Check, Copy } from "lucide-react";

import { Kbd } from "@/components/ui/kbd";
import { useShortcut } from "@/lib/shortcuts";
import { Button, buttonVariants } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { BookActions } from "@/components/book-actions";
import { Notice } from "@/components/ui/notice";
import { Logomark } from "@/components/brand";
import { CompilationPane, WorkPane } from "@/components/compilation-pane";
import { clearDraft } from "@/lib/workspace-draft";
import { cn, plural } from "@/lib/utils";
import { BookContents, BookReader } from "@/components/book";
import { countWords, splitBook } from "@/lib/book-md";
import { getDownloadUrl, type DiscoveredItem, type JobResponse } from "@/lib/api";
import { isLeftOutState, TOKENS_PER_WORD } from "@/lib/review";
import { StatusMessage } from "./shared";

// Which items count as "in the compilation": items that actually became
// chapters take precedence, so a source whose every item was left out is never
// counted or named as if it made the book. Falls back to the raw selection
// (jobs from before per-item outcomes carry none) and then to the full list.
function builtChapterItems(items: DiscoveredItem[]): DiscoveredItem[] {
  const selected = items.filter((it) => it.selected);
  const built = selected.filter((it) => it.compile_state === "done");
  return built.length ? built : selected.length ? selected : items;
}

// The payoff screen, framed as two destinations for the same compilation: EPUB
// to read on an e-reader, Markdown to feed an AI. The Markdown twin is fetched
// once so we can offer instant Copy and show its size (the AI's context budget
// is what the user weighs). We never gate by size: the right limit depends on
// the target LLM, so we inform rather than hide.
export function CompletedView({ jobId, job }: { jobId: string; job: JobResponse }) {
  const [md, setMd] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    let cancelled = false;
    fetch(getDownloadUrl(jobId, "md"))
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error("fetch failed"))))
      .then((t) => {
        if (!cancelled) setMd(t);
      })
      .catch(() => {
        /* leave Copy disabled; Download still works */
      });
    return () => {
      cancelled = true;
    };
  }, [jobId]);
  const epubBytes = job.epub_bytes ?? null;
  const chapters = useMemo(() => (md ? splitBook(md) : []), [md]);
  const [at, setAt] = useState(0);
  const words = md ? countWords(md) : null;
  const tokens = words != null ? Math.round(words * TOKENS_PER_WORD) : null;

  // Sources actually represented in the compilation: a source whose every item
  // was left out isn't in the book, and counting it would overstate what the
  // user is holding.
  const counted = builtChapterItems(job.discovered_items);
  const sourceCount =
    new Set(counted.map((it) => it.source_index)).size || job.sources.length;

  // Arriving here plays a one-shot arrival: the outputs cascade in. The rAF
  // defers the flip one frame so the transition runs from the hidden start
  // rather than being painted already-shown; reduced motion renders the settled
  // state instantly.
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setRevealed(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const rise =
    "transition-[opacity,transform] duration-1000 ease-out-expo motion-reduce:transition-none";
  const riseIn = revealed ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0";
  const delay = (ms: number) => ({
    transitionDelay: revealed ? `${ms}ms` : "0ms",
  });

  // D downloads the EPUB, C copies the Markdown, ← → turn the chapters.
  useShortcut("d", () => {
    const a = document.createElement("a");
    a.href = getDownloadUrl(jobId);
    a.download = "";
    a.click();
  });
  useShortcut("c", () => void copy(), !!md);
  useShortcut("arrowleft", () => setAt((i) => Math.max(0, i - 1)), chapters.length > 1);
  useShortcut("arrowright", () => setAt((i) => Math.min(chapters.length - 1, i + 1)), chapters.length > 1);

  async function copy() {
    if (!md) return;
    try {
      await navigator.clipboard.writeText(md);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked; Download remains the fallback */
    }
  }

  const shownWords = useCountUp(words);
  const meta = `${plural(sourceCount, "source")}${
    shownWords != null ? ` · ~${shownWords.toLocaleString("en-US")} words` : ""
  }`;

  return (
    <>
      {/* The book itself, open on the left: the thing just made, to check
          before it goes to an e-reader or an AI. */}
      <WorkPane label="Your compilation">
        {md ? (
          <BookReader chapters={chapters} at={at} onGo={setAt} />
        ) : (
          <StatusMessage label="Opening the compilation…" />
        )}
      </WorkPane>

      <CompilationPane
        eyebrow={
          <>
            <Logomark className="h-3.5 w-auto" />
            Ready
          </>
        }
        title={job.book_title ?? ""}
        titleClassName="ink-in"
        meta={meta}
        // What you do with the book, pinned under its contents so a long
        // table never pushes the downloads off screen. EPUB is the one gold
        // action; the Markdown copy is for an AI; starting over is the quietest.
        footer={
          <div className={cn("flex flex-col gap-2", rise, riseIn)} style={delay(350)}>
            {/* The gold menu on its own line (download a format, or send to an
                e-reader), the two quieter actions side by side under it. */}
            <BookActions
              epubUrl={getDownloadUrl(jobId)}
              mdUrl={getDownloadUrl(jobId, "md")}
              title={job.book_title ?? ""}
              epubNote={
                epubBytes != null
                  ? `For your e-reader · ${formatBytes(epubBytes)}`
                  : "For your e-reader"
              }
              mdNote={
                tokens != null ? `For an AI · ~${formatTokens(tokens)} tokens` : "For an AI"
              }
            />
            <div className="flex w-full gap-2">
              <Tooltip content="Copy the Markdown, to paste into an AI">
                  {/* Both labels share one grid cell, the idle one hidden, so
                      "Copied" never widens the button or shifts its row. */}
                  <Button type="button" variant="outline" onClick={copy} disabled={!md} aria-keyshortcuts="C" className="flex-1">
                    {copied ? <Check /> : <Copy />}
                    <span className="grid">
                      <span className={cn("col-start-1 row-start-1", copied && "invisible")}>Copy Markdown</span>
                      <span className={cn("col-start-1 row-start-1", !copied && "invisible")}>Markdown copied</span>
                    </span>
                    <Kbd>C</Kbd>
                  </Button>
                </Tooltip>
              <Link
                href="/"
                onClick={clearDraft}
                className={cn(buttonVariants({ variant: "ghost" }), "text-muted-foreground flex-1")}
              >
                New compilation
                <Kbd>N</Kbd>
              </Link>
            </div>
            <p className="text-muted-foreground text-xs">
              The full compilation as Markdown, ready to paste into an AI.
            </p>
            {tokens != null && tokens > 200000 && (
              <p className="text-muted-foreground text-xs">
                Large for some AIs: attaching the Markdown file may work better than pasting it.
              </p>
            )}
          </div>
        }
      >
        <BookContents chapters={chapters} at={at} onGo={setAt} />

        <LeftOutNotice
          items={job.discovered_items}
          className={cn(rise, riseIn)}
          style={delay(500)}
        />
      </CompilationPane>
    </>
  );
}

// A number that runs up to its value once, when it first arrives (the finished
// book's word count), easing out like the rest of the arrival.
function useCountUp(target: number | null, ms = 1200): number | null {
  const [shown, setShown] = useState<number | null>(null);
  useEffect(() => {
    if (target == null) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(target);
      return;
    }
    const start = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      const t = Math.min((now - start) / ms, 1);
      setShown(Math.round(target * (1 - (1 - t) ** 4)));
      if (t < 1) frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [target, ms]);
  return shown;
}

// What the user picked and didn't get. It sits above the downloads, not below:
// context for what they're about to take away, not a footnote. Absent entirely
// when everything made it, so a clean run never wears a warning. The arrival
// props (`className`/`style`) go on a wrapper INSIDE this component, past the
// early return: the pane is a flex column with a `gap`, so a caller-side
// wrapper would leave a gap-sized blank slot on a clean run.
function LeftOutNotice({
  items,
  className,
  style,
}: {
  items: DiscoveredItem[];
  className?: string;
  style?: CSSProperties;
}) {
  const leftOut = items.filter((it) => isLeftOutState(it.compile_state));
  if (leftOut.length === 0) return null;
  return (
    <div className={className} style={style}>
      <Notice variant="warning">
        <span className="font-medium">
          {plural(leftOut.length, "item")} didn’t make it in
        </span>
        {/* Bounded rather than truncated: a long list scrolls, so a compilation
            that lost twenty items says so twenty times instead of hiding the tail
            behind a count. */}
        <ul className="mt-1.5 flex max-h-40 flex-col gap-1.5 overflow-y-auto">
          {leftOut.map((it) => (
            <li key={it.id} className="flex min-w-0 flex-col">
              <span className="truncate" title={it.title}>{it.title}</span>
              {it.compile_note && <span className="text-xs">{it.compile_note}</span>}
            </li>
          ))}
        </ul>
      </Notice>
    </div>
  );
}

function formatBytes(n: number): string {
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTokens(n: number): string {
  return n >= 1000 ? `${Math.round(n / 1000)}k` : `${n}`;
}
