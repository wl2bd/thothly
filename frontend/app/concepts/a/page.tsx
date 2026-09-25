import { CheckIcon, PlusIcon, SettingsIcon } from "lucide-react";

import { Logotype } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { query, results } from "../data";
import { Pill, SearchField, Thumb } from "../parts";

// A: tool first. The home IS the tool: search on arrival, results below, and
// the picked sources ride in a tray at the bottom. The story moves to /about.
export default function ConceptA() {
  const picked = results.filter((r) => r.added);
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex h-14 items-center justify-between px-6">
        <Logotype className="h-7 w-auto" title="Thothly" />
        <div className="text-muted-foreground flex items-center gap-5 text-sm">
          <span>History</span>
          <span>About</span>
          <SettingsIcon className="size-4" />
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 pt-10 pb-40">
        <div className="flex flex-col gap-2">
          <h1 className="font-display text-4xl tracking-tight">Make anything readable</h1>
          <p className="text-muted-foreground">Videos, podcasts and articles, compiled into one book.</p>
        </div>
        <SearchField value={query} />
        <div className="text-muted-foreground flex gap-2 text-xs">
          {["All", "Videos", "Episodes", "Articles"].map((f, i) => (
            <span key={f} className={cn("rounded-full border px-3 py-1", i === 0 && "bg-secondary text-foreground")}>
              {f}
            </span>
          ))}
        </div>
        <ul className="flex flex-col divide-y">
          {results.map((r) => (
            <li key={r.title} className={cn("flex items-center gap-4 py-3", r.added && "bg-muted/60 -mx-3 rounded-lg px-3")}>
              <Thumb kind={r.kind} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Pill>{r.kind}</Pill>
                  <span className="truncate font-medium">{r.title}</span>
                </div>
                <p className="text-muted-foreground text-sm">{r.meta}</p>
              </div>
              <Button variant={r.added ? "secondary" : "outline"} size="icon-sm" aria-label="Add">
                {r.added ? <CheckIcon /> : <PlusIcon />}
              </Button>
            </li>
          ))}
        </ul>
      </main>

      {/* The tray: always one glance from the next step. */}
      <div className="bg-card/95 fixed inset-x-0 bottom-14 border-t backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-4 px-6 py-3">
          <div className="flex -space-x-3">
            {picked.map((p) => (
              <div key={p.title} className="bg-muted border-card h-9 w-12 rounded-md border-2" />
            ))}
          </div>
          <div className="flex-1 text-sm">
            <span className="font-medium">{picked.length} sources</span>
            <span className="text-muted-foreground"> · about 8 500 words</span>
          </div>
          <Button variant="ghost">Review</Button>
          <Button>Compile</Button>
        </div>
      </div>
    </div>
  );
}
