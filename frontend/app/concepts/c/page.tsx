import { CommandIcon, GripVerticalIcon, PlusIcon, SettingsIcon } from "lucide-react";

import { Logotype } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { chapters, query, results } from "../data";
import { FakeSwitch, Pill, SearchField, Thumb } from "../parts";

// C: the book is the canvas. You start from an empty book and fill its table
// of contents; finding sources is a palette (Ctrl K) that opens over it.
export default function ConceptC() {
  return (
    <div className="relative flex min-h-screen flex-col">
      <header className="flex h-14 items-center justify-between px-6">
        <Logotype className="h-7 w-auto" title="Thothly" />
        <div className="text-muted-foreground flex items-center gap-5 text-sm">
          <span>My books</span>
          <span>About</span>
          <SettingsIcon className="size-4" />
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-5xl flex-1 grid-cols-[1fr_260px] gap-10 px-6 py-10">
        <article className="bg-card shadow-flow-card flex flex-col gap-8 rounded-2xl border p-10">
          <div className="flex flex-col gap-2 border-b pb-6">
            <span className="text-muted-foreground text-2xs font-semibold tracking-wide uppercase">A compilation</span>
            <h1 className="font-display text-5xl tracking-tight">How transformers work</h1>
          </div>
          <div className="flex flex-col">
            <span className="text-muted-foreground mb-3 text-2xs font-semibold tracking-wide uppercase">Contents</span>
            <ol className="flex flex-col divide-y">
              {chapters.map((c, i) => (
                <li key={c.title} className="flex items-baseline gap-4 py-3">
                  <GripVerticalIcon className="text-muted-foreground size-4 self-center opacity-40" />
                  <span className="font-display text-muted-foreground w-6 text-lg tabular-nums">{i + 1}</span>
                  <span className="font-display flex-1 text-lg">{c.title}</span>
                  <span className="text-muted-foreground text-xs">{c.words}</span>
                </li>
              ))}
            </ol>
            <a href="#add" className="text-muted-foreground hover:text-foreground mt-3 flex items-center gap-2 rounded-lg border border-dashed p-3 text-sm">
              <PlusIcon className="size-4" /> Add a chapter
              <span className="ml-auto flex items-center gap-1 font-mono text-2xs">
                <CommandIcon className="size-3" />K
              </span>
            </a>
          </div>
        </article>

        <aside className="flex flex-col gap-6 pt-2 text-sm">
          <div className="flex flex-col gap-1">
            <span className="text-muted-foreground text-2xs font-semibold tracking-wide uppercase">Length</span>
            <span>29 800 words · about 2 h</span>
          </div>
          <div className="flex items-center justify-between">
            <span>AI polish</span>
            <FakeSwitch />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-muted-foreground text-2xs font-semibold tracking-wide uppercase">Formats</span>
            <span>EPUB · Markdown</span>
          </div>
          <Button size="lg">Compile the book</Button>
        </aside>
      </main>

      {/* The palette: opens over the book on "Add a chapter" (a CSS :target, no JS). */}
      <div id="add" className="absolute inset-0 hidden items-start justify-center pt-28 target:flex">
        <a href="#" aria-label="Close" className="bg-foreground/20 absolute inset-0 backdrop-blur-[2px]" />
        <div className="bg-popover relative w-full max-w-2xl overflow-hidden rounded-2xl border shadow-2xl">
          <SearchField value={query} className="rounded-none border-0 border-b shadow-none" />
          <ul className="flex max-h-96 flex-col overflow-y-auto p-2">
            {results.map((r, i) => (
              <li key={r.title} className={cn("flex items-center gap-3 rounded-lg p-2", i === 2 && "bg-muted")}>
                <Thumb kind={r.kind} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Pill>{r.kind}</Pill>
                    <span className="truncate text-sm font-medium">{r.title}</span>
                  </div>
                  <p className="text-muted-foreground text-xs">{r.meta}</p>
                </div>
                <span className="text-muted-foreground text-xs">{r.added ? "In the book" : "Enter to add"}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
