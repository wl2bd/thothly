"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ChevronDown, ChevronRight } from "lucide-react";

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
  fetchLlmConfig,
  getDownloadUrl,
  type DiscoveredItem,
  type JobResponse,
  type LlmConfig,
  type Source,
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
  const [llm, setLlm] = useState<LlmConfig | null>(null);
  const [roles, setRoles] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchLlmConfig()
      .then(setLlm)
      .catch(() => setLlm({ available: false, roles: [] }));
  }, []);

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

  // Bulk (de)select a set of ids at once — used by the per-source headers.
  const selectItems = useCallback((ids: string[], value: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (value) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }, []);

  const toggleRole = useCallback((roleId: string) => {
    setRoles((prev) => {
      const next = new Set(prev);
      if (next.has(roleId)) next.delete(roleId);
      else next.add(roleId);
      return next;
    });
  }, []);

  async function onConfirm() {
    setConfirming(true);
    setError(null);
    try {
      const updated = await confirmJob(
        id,
        [...selected],
        title.trim() || undefined,
        [...roles],
      );
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
            ← New compilation
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
            <StatusMessage label="Loading…" />
          ) : job.status === "pending" || job.status === "discovering" ? (
            <StatusMessage label="Discovering sources…" />
          ) : job.status === "reviewing" ? (
            <ReviewList
              items={job.discovered_items}
              sources={job.sources}
              selected={selected}
              title={title}
              confirming={confirming}
              llm={llm}
              selectedRoles={roles}
              onToggleRole={toggleRole}
              onTitleChange={setTitle}
              onToggle={toggle}
              onSelectItems={selectItems}
              onSelectAll={() => setSelected(new Set(job.discovered_items.map((it) => it.id)))}
              onSelectNone={() => setSelected(new Set())}
              onConfirm={onConfirm}
            />
          ) : job.status === "processing" ? (
            <StatusMessage label="Compiling the EPUB…" />
          ) : job.status === "completed" ? (
            <div className="flex flex-col items-start gap-6">
              <div className="flex flex-col gap-1.5">
                <p className="text-sm font-medium">Your EPUB is ready 🎉</p>
                {job.book_title && (
                  <p className="text-muted-foreground text-sm">{job.book_title}</p>
                )}
              </div>
              <a
                href={getDownloadUrl(id)}
                download
                className={buttonVariants({ size: "lg" })}
              >
                Download the EPUB
              </a>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <p className="text-destructive text-sm font-medium">
                Compilation failed.
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
  sources: Source[];
  selected: Set<string>;
  title: string;
  confirming: boolean;
  llm: LlmConfig | null;
  selectedRoles: Set<string>;
  onToggleRole: (id: string) => void;
  onTitleChange: (title: string) => void;
  onToggle: (id: string) => void;
  onSelectItems: (ids: string[], value: boolean) => void;
  onSelectAll: () => void;
  onSelectNone: () => void;
  onConfirm: () => void;
}

function ReviewList({
  items,
  sources,
  selected,
  title,
  confirming,
  llm,
  selectedRoles,
  onToggleRole,
  onTitleChange,
  onToggle,
  onSelectItems,
  onSelectAll,
  onSelectNone,
  onConfirm,
}: ReviewListProps) {
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());

  // How many *selected* videos read raw (would benefit from the punctuate role).
  const unpunctuatedSelected = items.filter(
    (it) =>
      selected.has(it.id) &&
      it.item_type === "youtube" &&
      it.has_transcript === true &&
      it.is_punctuated === false,
  ).length;

  const needle = query.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      needle
        ? items.filter((it) => it.title.toLowerCase().includes(needle))
        : items,
    [items, needle],
  );

  // Group by source so a multi-source compilation stays legible instead of one
  // giant mixed list. Source order is preserved.
  const groups = useMemo(() => {
    const map = new Map<number, DiscoveredItem[]>();
    for (const it of filtered) {
      const bucket = map.get(it.source_index);
      if (bucket) bucket.push(it);
      else map.set(it.source_index, [it]);
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [filtered]);

  const toggleCollapse = (index: number) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="book-title" className="text-muted-foreground text-xs">
          Book title
        </Label>
        <Input
          id="book-title"
          type="text"
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder="Compilation title"
        />
      </div>

      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">
          {items.length} item{items.length !== 1 ? "s" : ""} — {selected.size}{" "}
          selected
        </p>
        <div className="flex gap-1">
          <Button type="button" variant="ghost" size="xs" onClick={onSelectAll}>
            Select all
          </Button>
          <Button type="button" variant="ghost" size="xs" onClick={onSelectNone}>
            Deselect all
          </Button>
        </div>
      </div>

      {items.length > 8 && (
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search titles…"
        />
      )}

      <div className="-mx-2 flex max-h-[55vh] flex-col overflow-y-auto">
        {groups.length === 0 ? (
          <p className="text-muted-foreground px-3 py-8 text-center text-sm">
            No results for “{query}”.
          </p>
        ) : (
          groups.map(([sourceIndex, groupItems]) => {
            const ids = groupItems.map((it) => it.id);
            const selectedCount = ids.filter((id) => selected.has(id)).length;
            const allSelected = selectedCount === ids.length;
            const isCollapsed = collapsed.has(sourceIndex);
            return (
              <div key={sourceIndex} className="flex flex-col">
                <div className="bg-card/95 sticky top-0 z-10 flex items-center gap-2 px-3 py-2 backdrop-blur-sm">
                  <button
                    type="button"
                    onClick={() => toggleCollapse(sourceIndex)}
                    className="text-muted-foreground hover:text-foreground flex min-w-0 flex-1 items-center gap-1.5 transition-colors"
                  >
                    {isCollapsed ? (
                      <ChevronRight className="size-4 shrink-0" />
                    ) : (
                      <ChevronDown className="size-4 shrink-0" />
                    )}
                    <span className="truncate text-xs font-semibold tracking-wide uppercase">
                      {sourceLabel(sources[sourceIndex]?.url)}
                    </span>
                    <span className="text-muted-foreground/70 shrink-0 text-xs normal-case">
                      {selectedCount}/{groupItems.length}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onSelectItems(ids, !allSelected)}
                    className="text-muted-foreground hover:text-foreground shrink-0 text-xs hover:underline"
                  >
                    {allSelected ? "Deselect" : "Select"}
                  </button>
                </div>
                {!isCollapsed &&
                  groupItems.map((item) => (
                    <label
                      key={item.id}
                      className="hover:bg-muted/60 flex cursor-pointer items-center gap-3.5 rounded-lg px-3 py-2.5 transition-colors"
                    >
                      <Checkbox
                        checked={selected.has(item.id)}
                        onCheckedChange={() => onToggle(item.id)}
                      />
                      <span className="flex min-w-0 flex-1 flex-col gap-1">
                        <span className="truncate text-sm">{item.title}</span>
                        <span className="text-muted-foreground flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs">
                          <span>
                            {item.item_type === "youtube" ? "YouTube" : "Article"}
                          </span>
                          {formatMeta(item).map((part) => (
                            <span key={part}>· {part}</span>
                          ))}
                          {statusBadge(item)}
                        </span>
                      </span>
                    </label>
                  ))}
              </div>
            );
          })
        )}
      </div>

      {llm && llm.roles.length > 0 && (
        <RoleSelector
          llm={llm}
          selectedRoles={selectedRoles}
          onToggleRole={onToggleRole}
          unpunctuatedSelected={unpunctuatedSelected}
        />
      )}

      <Button
        size="lg"
        onClick={onConfirm}
        disabled={confirming || selected.size === 0}
        className="w-full"
      >
        {confirming
          ? "Starting…"
          : `Compile ${selected.size} item${selected.size !== 1 ? "s" : ""}`}
      </Button>
    </div>
  );
}

interface RoleSelectorProps {
  llm: LlmConfig;
  selectedRoles: Set<string>;
  onToggleRole: (id: string) => void;
  unpunctuatedSelected: number;
}

function RoleSelector({
  llm,
  selectedRoles,
  onToggleRole,
  unpunctuatedSelected,
}: RoleSelectorProps) {
  const disabled = !llm.available;
  return (
    <div className="border-border flex flex-col gap-3 rounded-xl border border-dashed p-4">
      <div className="flex flex-col gap-0.5">
        <p className="text-sm font-medium">AI cleanup</p>
        <p className="text-muted-foreground text-xs">
          {disabled
            ? "Configure an LLM on the server (LLM_BASE_URL / LLM_MODEL) to enable it."
            : unpunctuatedSelected > 0
              ? `${unpunctuatedSelected} unpunctuated video${unpunctuatedSelected !== 1 ? "s" : ""} in the selection — punctuation will make them readable.`
              : "Improves the selected transcripts. No cost on the default path."}
        </p>
      </div>

      <ul className="flex flex-col gap-2.5">
        {llm.roles.map((role) => (
          <li key={role.id}>
            <label
              className={`flex items-start gap-3 ${
                disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"
              }`}
            >
              <Checkbox
                checked={selectedRoles.has(role.id)}
                onCheckedChange={() => onToggleRole(role.id)}
                disabled={disabled}
                className="mt-0.5"
              />
              <span className="flex flex-col gap-0.5">
                <span className="text-sm leading-none font-medium">{role.label}</span>
                <span className="text-muted-foreground text-xs">
                  {role.description}
                </span>
              </span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}

// A compact, recognizable label for a source group, derived from the URL the
// user entered (e.g. "youtube.com/@channel", "jakub.kr"). Friendlier source
// names (channel/blog titles) would need the backend to surface them.
function sourceLabel(url: string | undefined): string {
  if (!url) return "Source";
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");
    const path = parsed.pathname.replace(/\/+$/, "");
    return path && path !== "" ? `${host}${path}` : host;
  } catch {
    return url;
  }
}

function formatMeta(item: DiscoveredItem): string[] {
  // Reading time (from the transcript word count) is the most relevant figure
  // for an EPUB, so it leads; the video duration and language follow. The blog
  // char-count reflected the RSS summary (often truncated), so it stays hidden.
  const parts: string[] = [];
  if (item.reading_time_min != null) {
    parts.push(`~${item.reading_time_min} min read`);
  }
  if (item.word_count != null) {
    parts.push(`${item.word_count.toLocaleString("en-US")} words`);
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
    return <Badge variant="destructive">⛔ No subtitles</Badge>;
  }
  if (item.has_transcript == null) {
    return <Badge variant="secondary">❓ Subtitles unchecked</Badge>;
  }
  if (item.is_punctuated) {
    return (
      <Badge className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
        ✅ Punctuated
      </Badge>
    );
  }
  return (
    <Badge className="bg-amber-500/10 text-amber-700 dark:text-amber-500">
      ⚠️ LLM cleanup
    </Badge>
  );
}
