"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  confirmJob,
  fetchJob,
  getDownloadUrl,
  type DiscoveredItem,
  type JobResponse,
} from "@/lib/api";

const ACTIVE_STATUSES = ["pending", "discovering", "processing"];

export default function JobPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [job, setJob] = useState<JobResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [pollKey, setPollKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function poll(): Promise<boolean> {
      try {
        const data = await fetchJob(id);
        if (cancelled) return true;
        setJob(data);
        return !ACTIVE_STATUSES.includes(data.status);
      } catch (err) {
        if (cancelled) return true;
        setError(err instanceof Error ? err.message : String(err));
        return true;
      }
    }

    const interval = setInterval(async () => {
      if (await poll()) clearInterval(interval);
    }, 2000);
    poll().then((done) => done && clearInterval(interval));

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [id, pollKey]);

  // When discovery completes, pre-select every item — the user unchecks what
  // they don't want rather than building the list from scratch.
  useEffect(() => {
    if (job?.status === "reviewing") {
      setSelected(new Set(job.discovered_items.map((it) => it.id)));
    }
  }, [job?.status, job?.discovered_items]);

  const toggle = useCallback((itemId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }, []);

  async function onConfirm() {
    setConfirming(true);
    setError(null);
    try {
      const updated = await confirmJob(id, [...selected]);
      setJob(updated);
      setPollKey((k) => k + 1); // resume polling for the compilation phase
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setConfirming(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-8">
      <header className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Thothly</h1>
        <Link href="/" className="text-muted-foreground text-sm hover:underline">
          ← Nouvelle compilation
        </Link>
      </header>

      {error && <p className="text-destructive text-sm">{error}</p>}

      {!job ? (
        <p className="text-muted-foreground text-sm">Chargement…</p>
      ) : job.status === "pending" || job.status === "discovering" ? (
        <StatusMessage label="Découverte des sources en cours…" />
      ) : job.status === "reviewing" ? (
        <ReviewList
          items={job.discovered_items}
          selected={selected}
          confirming={confirming}
          onToggle={toggle}
          onSelectAll={() => setSelected(new Set(job.discovered_items.map((it) => it.id)))}
          onSelectNone={() => setSelected(new Set())}
          onConfirm={onConfirm}
        />
      ) : job.status === "processing" ? (
        <StatusMessage label="Compilation de l'EPUB en cours…" />
      ) : job.status === "completed" ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm">
            EPUB prêt{job.book_title ? ` : ${job.book_title}` : ""}.
          </p>
          <a href={getDownloadUrl(id)} download className={buttonVariants()}>
            Télécharger l&apos;EPUB
          </a>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-destructive text-sm">La compilation a échoué.</p>
          {job.error && (
            <p className="text-muted-foreground font-mono text-xs">{job.error}</p>
          )}
        </div>
      )}
    </main>
  );
}

function StatusMessage({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="border-muted-foreground/40 border-t-foreground inline-block size-3 animate-spin rounded-full border-2" />
      {label}
    </div>
  );
}

interface ReviewListProps {
  items: DiscoveredItem[];
  selected: Set<string>;
  confirming: boolean;
  onToggle: (id: string) => void;
  onSelectAll: () => void;
  onSelectNone: () => void;
  onConfirm: () => void;
}

function ReviewList({
  items,
  selected,
  confirming,
  onToggle,
  onSelectAll,
  onSelectNone,
  onConfirm,
}: ReviewListProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">
          {items.length} élément{items.length > 1 ? "s" : ""} trouvé
          {items.length > 1 ? "s" : ""} — {selected.size} sélectionné
          {selected.size > 1 ? "s" : ""}
        </p>
        <div className="flex gap-1">
          <Button type="button" variant="ghost" size="xs" onClick={onSelectAll}>
            Tout cocher
          </Button>
          <Button type="button" variant="ghost" size="xs" onClick={onSelectNone}>
            Tout décocher
          </Button>
        </div>
      </div>

      <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
        {items.map((item) => (
          <li key={item.id}>
            <label className="flex cursor-pointer items-center gap-3 px-3 py-2">
              <input
                type="checkbox"
                checked={selected.has(item.id)}
                onChange={() => onToggle(item.id)}
                className="size-4"
              />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm">{item.title}</span>
                <span className="text-muted-foreground text-xs">
                  {item.item_type === "youtube" ? "YouTube" : "Article"}
                  {formatMeta(item) ? ` · ${formatMeta(item)}` : ""}
                </span>
              </span>
            </label>
          </li>
        ))}
      </ul>

      <Button onClick={onConfirm} disabled={confirming || selected.size === 0}>
        {confirming ? "Lancement…" : `Compiler ${selected.size} élément${selected.size > 1 ? "s" : ""}`}
      </Button>
    </div>
  );
}

function formatMeta(item: DiscoveredItem): string | null {
  // Only the YouTube duration is reliable. The blog char-count reflected the
  // RSS summary (often truncated or empty), not the real article, so it's hidden.
  if (item.estimated_duration_s != null) {
    const m = Math.floor(item.estimated_duration_s / 60);
    const s = item.estimated_duration_s % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }
  return null;
}
