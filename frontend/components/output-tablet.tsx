import { StoneBorder } from "@/components/ui/stone-border";
import { cn } from "@/lib/utils";

// The two output formats, drawn as stone tablets — the same pair shown in the
// landing's "how it works" funnel, reused on the completed-job screen so the
// thing the user was promised is the thing they're handed. Each is a faux
// preview of its format (a typeset book page vs. raw Markdown) carved into a
// stone slab via StoneBorder. Decorative on the landing (aria-hidden); on the
// completed screen they carry a real mini-preview of the compilation that was
// just made (pass the props below) so the slab shows the actual book, not a
// stand-in.
//
// StoneFilterDefs must be mounted once near the app root (it is, in layout.tsx)
// for the carved edge to resolve.

// Skeleton bar widths for the faux e-reader page; null = a paragraph break. Also
// the stand-in body while a real preview's prose is still loading.
const LINES = ["100%", "92%", "97%", "85%", null, "100%", "94%", "90%", "96%"];
// Faux-text band widths for the markdown panel's body (after the real header).
const MD_BANDS = ["100%", "92%", "96%", "88%"];

// The skeleton "page of text" — bars, not real glyphs — used for the faux
// landing page and as the placeholder body while a real preview's prose loads.
function PageBars() {
  return (
    <div className="flex flex-1 flex-col gap-1.5">
      {LINES.map((w, i) =>
        w === null ? (
          <span key={i} className="h-1" />
        ) : (
          <span
            key={i}
            className="bg-muted h-1.5 rounded-full"
            style={{ width: w }}
          />
        ),
      )}
    </div>
  );
}

interface EpubTabletProps {
  className?: string;
  // Real-compilation preview (the completed screen). When `title` is given the
  // tablet renders the actual first chapter — eyebrow, title, opening prose —
  // instead of the generic faux page the landing illustration keeps. `body` may
  // arrive a beat after `title` (it's parsed from the fetched Markdown twin); the
  // page bars stand in until it does.
  eyebrow?: string;
  title?: string;
  body?: string;
}

function EpubTablet({ className, eyebrow, title, body }: EpubTabletProps) {
  const real = title != null;
  return (
    <StoneBorder aria-hidden="true" className="stone-fade-b">
      <div
        className={cn(
          "bg-transparent text-card-foreground relative h-44 overflow-hidden rounded-xl p-6",
          className,
        )}
      >
        <div className="flex h-full flex-col gap-2">
          <div className="flex flex-col gap-1">
            <span className="text-muted-foreground text-[0.55rem] font-medium tracking-[0.2em] uppercase">
              {real ? (eyebrow ?? "Chapter 1") : "Chapter 2"}
            </span>
            <span className="font-edition text-foreground line-clamp-2 text-[0.95rem] leading-tight font-semibold">
              {real ? title : "The new HTTP QUERY method"}
            </span>
          </div>
          {real ? (
            body ? (
              <p className="font-edition text-muted-foreground line-clamp-6 text-[0.66rem] leading-relaxed">
                {body}
              </p>
            ) : (
              <PageBars />
            )
          ) : (
            <>
              <p className="font-edition text-muted-foreground text-[0.66rem] leading-relaxed">
                A safe, idempotent way to send a body with your queries.
              </p>
              <PageBars />
            </>
          )}
        </div>
      </div>
    </StoneBorder>
  );
}

interface MarkdownTabletProps {
  className?: string;
  // Real-compilation preview (the completed screen): the actual first lines of
  // the Markdown twin (its "# Sources" index). Omitted on the landing, which
  // keeps the faux structure below.
  lines?: string[];
}

// One line of the real Markdown preview: headings read in ink, everything else
// muted; blank lines keep their spacing. Each line clips at the slab's edge
// (truncate) so a long link or title never wraps or overflows.
function MarkdownLine({ line }: { line: string }) {
  if (line.trim() === "") return <span className="block h-1.5" />;
  const isHeading = /^#{1,6}\s/.test(line);
  return (
    <span
      className={cn(
        "block truncate",
        isHeading ? "text-foreground" : "text-muted-foreground",
      )}
    >
      {line}
    </span>
  );
}

function MarkdownTablet({ className, lines }: MarkdownTabletProps) {
  return (
    <StoneBorder aria-hidden="true" className="stone-fade-b">
      <div
        className={cn(
          "bg-transparent relative h-44 overflow-hidden rounded-xl p-6",
          className,
        )}
      >
        {lines ? (
          <div className="flex h-full flex-col gap-1 font-mono text-[0.6rem] leading-relaxed">
            {lines.slice(0, 10).map((line, i) => (
              <MarkdownLine key={i} line={line} />
            ))}
          </div>
        ) : (
          <div className="flex h-full flex-col gap-1.5 font-mono text-[0.6rem] leading-relaxed">
            <p className="text-foreground"># Sources</p>
            <p className="text-foreground mt-1">## The new HTTP QUERY method</p>
            <p className="text-muted-foreground">
              A safe, idempotent way to send a body with your queries.
            </p>
            <p className="text-muted-foreground/70">- [Original article](https://…)</p>
            {MD_BANDS.map((w, i) => (
              <span
                key={i}
                className="bg-muted mt-0.5 h-1.5 rounded"
                style={{ width: w }}
              />
            ))}
          </div>
        )}
      </div>
    </StoneBorder>
  );
}

export { EpubTablet, MarkdownTablet };
