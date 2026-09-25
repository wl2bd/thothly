import { SearchIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="border-border text-muted-foreground rounded-md border px-1.5 py-0.5 text-2xs font-medium tracking-wide uppercase">
      {children}
    </span>
  );
}

export function SearchField({ value, className }: { value?: string; className?: string }) {
  return (
    <div className={cn("border-input bg-card flex h-12 items-center gap-3 rounded-xl border px-4 shadow-sm", className)}>
      <SearchIcon className="text-muted-foreground size-4" />
      <span className={value ? "" : "text-muted-foreground"}>
        {value ?? "Search a topic, or paste a link"}
      </span>
    </div>
  );
}

export function Thumb({ kind }: { kind: string }) {
  return (
    <div
      className={cn(
        "bg-muted h-12 w-20 shrink-0 rounded-md",
        kind === "Article" && "bg-surface-sunken bg-[repeating-linear-gradient(180deg,transparent_0_6px,var(--border)_6px_7px)]",
      )}
    />
  );
}

export function FakeSwitch({ on }: { on?: boolean }) {
  return (
    <span className={cn("inline-flex h-5 w-9 items-center rounded-full p-0.5", on ? "bg-primary" : "bg-secondary")}>
      <span className={cn("bg-card size-4 rounded-full shadow", on && "translate-x-4")} />
    </span>
  );
}
