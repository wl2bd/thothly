import { CheckIcon, GripVerticalIcon, PlusIcon, SettingsIcon, XIcon } from "lucide-react";

import { Logotype } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { chapters, query, results } from "../data";
import { FakeSwitch, Pill, SearchField, Thumb } from "../parts";

// D: B's two panes with A's compact result rows (small thumbnails).
// B: two-pane workspace. Left: find. Right: the compilation, built live, with
// chapters, order, AI polish and the compile button. No separate review page.
export default function ConceptD() {
  return (
    <div className="flex h-screen flex-col">
      <header className="flex h-14 shrink-0 items-center justify-between border-b px-5">
        <div className="flex items-center gap-6">
          <Logotype className="h-6 w-auto" title="Thothly" />
          <nav className="text-muted-foreground flex gap-4 text-sm">
            <span className="text-foreground">New</span>
            <span>History</span>
          </nav>
        </div>
        <div className="text-muted-foreground flex items-center gap-4 text-sm">
          <span>About</span>
          <SettingsIcon className="size-4" />
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[1fr_400px]">
        <section className="flex min-h-0 flex-col gap-4 overflow-y-auto p-6">
          <SearchField value={query} />
          <div className="text-muted-foreground flex items-center justify-between text-xs">
            <div className="flex gap-2">
              {["All", "Videos", "Episodes", "Articles"].map((f, i) => (
                <span key={f} className={cn("rounded-full border px-3 py-1", i === 0 && "bg-secondary text-foreground")}>
                  {f}
                </span>
              ))}
            </div>
            <span>Best match</span>
          </div>
          <ul className="flex flex-col divide-y pb-16">
            {results.map((r) => (
              <li key={r.title} className={cn("flex items-center gap-3 py-2.5", r.added && "bg-muted/60 -mx-3 rounded-lg px-3")}>
                <Thumb kind={r.kind} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Pill>{r.kind}</Pill>
                    <span className="truncate text-sm font-medium">{r.title}</span>
                  </div>
                  <p className="text-muted-foreground text-xs">{r.meta}</p>
                </div>
                <Button variant={r.added ? "secondary" : "outline"} size="icon-sm" aria-label="Add">
                  {r.added ? <CheckIcon /> : <PlusIcon />}
                </Button>
              </li>
            ))}
          </ul>
        </section>

        <aside className="bg-surface-sunken flex min-h-0 flex-col border-l">
          <div className="flex flex-col gap-1 border-b p-5">
            <span className="text-muted-foreground text-2xs font-semibold tracking-wide uppercase">Your compilation</span>
            <span className="font-display text-2xl tracking-tight">How transformers work</span>
            <span className="text-muted-foreground text-sm">3 chapters · 29 800 words · about 2 h of reading</span>
          </div>
          <ol className="flex flex-1 flex-col gap-2 overflow-y-auto p-4">
            {chapters.map((c, i) => (
              <li key={c.title} className="bg-card flex items-center gap-3 rounded-lg border p-3">
                <GripVerticalIcon className="text-muted-foreground size-4" />
                <span className="text-muted-foreground w-4 text-sm tabular-nums">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{c.title}</p>
                  <p className="text-muted-foreground text-xs">
                    {c.tag} · {c.words}
                  </p>
                </div>
                <XIcon className="text-muted-foreground size-4" />
              </li>
            ))}
            <li className="text-muted-foreground rounded-lg border border-dashed p-3 text-center text-xs">
              Add up to 7 more sources
            </li>
          </ol>
          <div className="flex flex-col gap-3 border-t p-5 pb-16">
            <div className="flex items-center justify-between text-sm">
              <span>AI polish</span>
              <FakeSwitch />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1">
                Preview
              </Button>
              <Button className="flex-1">Compile</Button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
