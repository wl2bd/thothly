import { StoneBorder } from "@/components/ui/stone-border";
import { cn } from "@/lib/utils";

// The two output formats, drawn as stone tablets — the same pair shown in the
// landing's "how it works" funnel, reused on the completed-job screen so the
// thing the user was promised is the thing they're handed. Each is a faux
// preview of its format (a typeset book page vs. raw Markdown) carved into a
// stone slab via StoneBorder. Decorative only (aria-hidden); the real label and
// actions sit beside each tablet at the call site.
//
// StoneFilterDefs must be mounted once near the app root (it is, in layout.tsx)
// for the carved edge to resolve.

// Skeleton bar widths for the faux e-reader page; null = a paragraph break.
const LINES = ["100%", "92%", "97%", "85%", null, "100%", "94%", "90%", "96%"];
// Faux-text band widths for the markdown panel's body (after the real header).
const MD_BANDS = ["100%", "92%", "96%", "88%"];

// Fades the tablet's text out at its bottom edge so the faux content reads as a
// trimmed page rather than ending on a hard line. Fades to the card color (the
// stone fill), so it works on any surface the tablet sits on.
function BottomFade() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 bottom-0 h-12"
      style={{ backgroundImage: "linear-gradient(to top, var(--card), transparent)" }}
    />
  );
}

function EpubTablet({ className }: { className?: string }) {
  return (
    <StoneBorder aria-hidden="true">
      <div
        className={cn(
          "bg-transparent text-card-foreground relative h-44 overflow-hidden rounded-xl p-6",
          className,
        )}
      >
        <div className="flex h-full flex-col gap-2">
          <div className="flex flex-col gap-1">
            <span className="text-muted-foreground text-[0.55rem] font-medium tracking-[0.2em] uppercase">
              Chapter 2
            </span>
            <span className="font-edition text-foreground text-[0.95rem] font-semibold leading-tight">
              The new HTTP QUERY method
            </span>
          </div>
          <p className="font-edition text-muted-foreground text-[0.66rem] leading-relaxed">
            A safe, idempotent way to send a body with your queries.
          </p>
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
        </div>
        <BottomFade />
      </div>
    </StoneBorder>
  );
}

function MarkdownTablet({ className }: { className?: string }) {
  return (
    <StoneBorder aria-hidden="true">
      <div
        className={cn(
          "bg-transparent relative h-44 overflow-hidden rounded-xl p-6",
          className,
        )}
      >
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
        <BottomFade />
      </div>
    </StoneBorder>
  );
}

export { EpubTablet, MarkdownTablet };
