"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
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
  const [title, setTitle] = useState("");
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
      setTitle(job.book_title ?? "");
    }
  }, [job?.status, job?.discovered_items, job?.book_title]);

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
      const updated = await confirmJob(id, [...selected], title.trim() || undefined);
      setJob(updated);
      setPollKey((k) => k + 1); // resume polling for the compilation phase
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setConfirming(false);
    }
  }

  return (
    <main className="flex min-h-screen justify-center p-8 sm:p-12">
      <div className="flex w-full max-w-xl flex-col gap-10 py-12">
        <header className="flex items-baseline justify-between">
          <Link
            href="/"
            className="font-heading text-2xl font-semibold tracking-tight"
          >
            Thothly
          </Link>
          <Link href="/" className="text-muted-foreground text-sm hover:underline">
            ← Nouvelle compilation
          </Link>
        </header>

        {error && (
          <p className="text-destructive bg-destructive/10 rounded-lg px-3 py-2 text-sm">
            {error}
          </p>
        )}

        <Card>
          <CardContent>
          {!job ? (
            <StatusMessage label="Chargement…" />
          ) : job.status === "pending" || job.status === "discovering" ? (
            <StatusMessage label="Découverte des sources en cours…" />
          ) : job.status === "reviewing" ? (
            <ReviewList
              items={job.discovered_items}
              selected={selected}
              title={title}
              confirming={confirming}
              onTitleChange={setTitle}
              onToggle={toggle}
              onSelectAll={() => setSelected(new Set(job.discovered_items.map((it) => it.id)))}
              onSelectNone={() => setSelected(new Set())}
              onConfirm={onConfirm}
            />
          ) : job.status === "processing" ? (
            <StatusMessage label="Compilation de l'EPUB en cours…" />
          ) : job.status === "completed" ? (
            <div className="flex flex-col items-start gap-6">
              <div className="flex flex-col gap-1.5">
                <p className="text-sm font-medium">Ton EPUB est prêt 🎉</p>
                {job.book_title && (
                  <p className="text-muted-foreground text-sm">{job.book_title}</p>
                )}
              </div>
              <a
                href={getDownloadUrl(id)}
                download
                className={buttonVariants({ size: "lg" })}
              >
                Télécharger l&apos;EPUB
              </a>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <p className="text-destructive text-sm font-medium">
                La compilation a échoué.
              </p>
              {job.error && (
                <p className="text-muted-foreground font-mono text-xs">{job.error}</p>
              )}
            </div>
          )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

function StatusMessage({ label }: { label: string }) {
  return (
    <div className="text-muted-foreground flex items-center gap-3 text-sm">
      <Spinner />
      {label}
    </div>
  );
}

interface ReviewListProps {
  items: DiscoveredItem[];
  selected: Set<string>;
  title: string;
  confirming: boolean;
  onTitleChange: (title: string) => void;
  onToggle: (id: string) => void;
  onSelectAll: () => void;
  onSelectNone: () => void;
  onConfirm: () => void;
}

function ReviewList({
  items,
  selected,
  title,
  confirming,
  onTitleChange,
  onToggle,
  onSelectAll,
  onSelectNone,
  onConfirm,
}: ReviewListProps) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="book-title" className="text-muted-foreground text-xs">
          Titre du livre
        </Label>
        <Input
          id="book-title"
          type="text"
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder="Titre de la compilation"
        />
      </div>

      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">
          {items.length} élément{items.length > 1 ? "s" : ""} — {selected.size}{" "}
          sélectionné{selected.size > 1 ? "s" : ""}
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

      <ul className="-mx-2 flex max-h-[55vh] flex-col overflow-y-auto">
        {items.map((item) => (
          <li key={item.id}>
            <label className="hover:bg-muted/60 flex cursor-pointer items-center gap-3.5 rounded-lg px-3 py-2.5 transition-colors">
              <Checkbox
                checked={selected.has(item.id)}
                onCheckedChange={() => onToggle(item.id)}
              />
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="truncate text-sm">{item.title}</span>
                <span className="text-muted-foreground flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs">
                  <span>{item.item_type === "youtube" ? "YouTube" : "Article"}</span>
                  {formatMeta(item).map((part) => (
                    <span key={part}>· {part}</span>
                  ))}
                  {statusBadge(item)}
                </span>
              </span>
            </label>
          </li>
        ))}
      </ul>

      <Button
        size="lg"
        onClick={onConfirm}
        disabled={confirming || selected.size === 0}
        className="w-full"
      >
        {confirming
          ? "Lancement…"
          : `Compiler ${selected.size} élément${selected.size > 1 ? "s" : ""}`}
      </Button>
    </div>
  );
}

function formatMeta(item: DiscoveredItem): string[] {
  // Reading time (from the transcript word count) is the most relevant figure
  // for an EPUB, so it leads; the video duration and language follow. The blog
  // char-count reflected the RSS summary (often truncated), so it stays hidden.
  const parts: string[] = [];
  if (item.reading_time_min != null) {
    parts.push(`~${item.reading_time_min} min de lecture`);
  }
  if (item.word_count != null) {
    parts.push(`${item.word_count.toLocaleString("fr-FR")} mots`);
  }
  if (item.estimated_duration_s != null) {
    const m = Math.floor(item.estimated_duration_s / 60);
    const s = item.estimated_duration_s % 60;
    parts.push(`${m}:${String(s).padStart(2, "0")}`);
  }
  if (item.transcript_lang) {
    parts.push(item.transcript_lang.toUpperCase());
  }
  return parts;
}

// Per-video readiness, shown so the user knows before compiling whether a
// transcript reads cleanly, will need an LLM cleanup, or is missing entirely.
function statusBadge(item: DiscoveredItem) {
  if (item.item_type !== "youtube") return null;

  if (item.has_transcript === false) {
    return <Badge variant="destructive">⛔ Pas de sous-titres</Badge>;
  }
  if (item.has_transcript == null) {
    return <Badge variant="secondary">❓ Sous-titres non vérifiés</Badge>;
  }
  if (item.is_punctuated) {
    return (
      <Badge className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
        ✅ Ponctué
      </Badge>
    );
  }
  return (
    <Badge className="bg-amber-500/10 text-amber-700 dark:text-amber-500">
      ⚠️ Nettoyage LLM
    </Badge>
  );
}
