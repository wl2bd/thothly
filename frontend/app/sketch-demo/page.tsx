"use client";

import { useEffect, useState } from "react";

import { ToolSketch } from "@/components/tool-sketch";
import { cn } from "@/lib/utils";

// Throwaway demo (September 2026): three ways to draw the home sketch's
// compilation as a picture rather than a card to read. It runs on and fades
// out at the bottom, so its end is never seen. Not linked from anywhere.

const SHEET =
  "border-foreground/15 bg-card text-muted-foreground absolute top-0 flex h-80 flex-col overflow-hidden rounded-t-lg border-x border-t px-5 pt-4 text-left shadow-sm dark:shadow-none";

// The page lies on the table, seen at an angle.
// The fade sits on the whole group, so a sheet in front hides the ones behind.
const ANGLE =
  "[transform:perspective(900px)_rotateX(24deg)_rotate(-1.5deg)] origin-top [mask-image:linear-gradient(to_bottom,black_35%,transparent_92%)]";

const P1 =
  "Stoicism began in Athens, where Zeno of Citium taught from a painted porch. Its promise was plain: we do not choose what happens to us, only how we answer it.";
const P2 =
  "The first principle is to sort what is up to us from what is not. Opinion, intention and desire are ours; the body, reputation and fortune are not.";
const P3 =
  "Epictetus, born a slave, made this the heart of his teaching. Marcus Aurelius wrote it down again, night after night, as a note to himself.";

function RawSheet({ className }: { className?: string }) {
  return (
    <div className={cn(SHEET, "font-sans", className)}>
      <span className="text-foreground/80 text-sm">Stoicism</span>
      <span className="mt-3 text-xs">Stoicism, TED-Ed</span>
      <p className="mt-1.5 text-xs leading-relaxed">{P1}</p>
      <span className="mt-3 text-xs">10 Stoic principles</span>
      <p className="mt-1.5 text-xs leading-relaxed">{P2}</p>
      <p className="mt-1.5 text-xs leading-relaxed">{P3}</p>
    </div>
  );
}

function MarkdownSheet({ className }: { className?: string }) {
  return (
    <div className={cn(SHEET, "font-mono text-2xs leading-relaxed", className)}>
      <span className="text-foreground/80"># Stoicism</span>
      <span className="mt-3 text-foreground/70">## 1. Stoicism, TED-Ed</span>
      <span className="text-muted-foreground/60">&gt; source: youtube.com/watch?v=…</span>
      <p className="mt-2">{P1}</p>
      <span className="mt-3 text-foreground/70">## 2. 10 Stoic principles</span>
      <p className="mt-2">
        - **Dichotomy of control**: sort what is up to us from what is not.
      </p>
      <p className="mt-1">- **Premeditatio malorum**: rehearse the worst, calmly.</p>
    </div>
  );
}

function BookSheet({ className }: { className?: string }) {
  return (
    <div className={cn(SHEET, "px-6 pt-5", className)}>
      <span className="eyebrow text-inherit">Chapter 1</span>
      <span className="font-display text-foreground/80 mt-1 text-lg tracking-tight">
        The painted porch
      </span>
      <p className="mt-3 text-xs leading-relaxed">
        <span className="font-display text-primary float-left mt-0.5 mr-1.5 text-4xl leading-[0.8]">
          S
        </span>
        {P1.slice(1)} The idea returns in every source of this book{" "}
        <span className="text-primary-strong underline decoration-current/40 underline-offset-2">
          (see ch. 3)
        </span>
        .
      </p>
      <p className="mt-2 indent-4 text-xs leading-relaxed">
        {P3}{" "}
        <span className="text-primary-strong underline decoration-current/40 underline-offset-2">
          Meditations, ch. 2
        </span>
        .
      </p>
    </div>
  );
}

// A: one page, at an angle, running off the bottom.
function VariantA() {
  return (
    <div className={cn("relative h-80 w-80", ANGLE)}>
      <BookSheet className="inset-x-0" />
    </div>
  );
}

// B: the three outputs fanned out, the book in front.
function VariantB() {
  return (
    <div className={cn("relative h-96 w-[36rem]", ANGLE)}>
      <MarkdownSheet className="left-2 w-60 -rotate-6 translate-y-10" />
      <RawSheet className="right-2 w-60 rotate-6 translate-y-10" />
      <BookSheet className="left-1/2 w-64 -translate-x-1/2" />
    </div>
  );
}

// C: one page that turns into each output in turn.
const FORMATS = [
  { label: "Raw compilation", Sheet: RawSheet },
  { label: "Markdown for AI", Sheet: MarkdownSheet },
  { label: "Edited book", Sheet: BookSheet },
];

function VariantC() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((n) => (n + 1) % FORMATS.length), 4000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="flex flex-col items-center gap-3">
      <div className={cn("relative h-80 w-80", ANGLE)}>
        {FORMATS.map(({ label, Sheet }, n) => (
          <Sheet
            key={label}
            className={cn(
              "inset-x-0 transition-opacity duration-700",
              n === i ? "opacity-100" : "opacity-0",
            )}
          />
        ))}
      </div>
    </div>
  );
}

const VARIANTS = [
  { id: "A", label: "A · Page en angle", View: VariantA },
  { id: "B", label: "B · Trois sorties en éventail", View: VariantB },
  { id: "C", label: "C · Une page qui change de format", View: VariantC },
];

export default function SketchDemo() {
  const [v, setV] = useState("A");
  // Full-colour glow, as on the home page at rest.
  useEffect(() => {
    document.documentElement.setAttribute("data-glow-full", "");
    return () => document.documentElement.removeAttribute("data-glow-full");
  }, []);
  const { View } = VARIANTS.find((x) => x.id === v)!;
  return (
    <main className="flex flex-col items-center px-4 pt-16 pb-24">
      <div className="w-full max-w-xl">
        <ToolSketch key={v} book={<View />} />
      </div>
      <nav className="bg-foreground text-background fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 gap-1 rounded-full p-1 text-xs shadow-lg">
        {VARIANTS.map((x) => (
          <button
            key={x.id}
            type="button"
            onClick={() => setV(x.id)}
            className={cn("rounded-full px-3 py-1.5", v === x.id ? "bg-background/20" : "hover:bg-background/10")}
          >
            {x.label}
          </button>
        ))}
      </nav>
    </main>
  );
}
