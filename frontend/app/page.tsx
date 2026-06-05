"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { createJob, type Source, type SourceType } from "@/lib/api";

const SOURCE_TYPES: { value: SourceType; label: string }[] = [
  { value: "youtube_playlist", label: "Playlist YouTube" },
  { value: "youtube_channel", label: "Chaîne YouTube" },
  { value: "blog_rss", label: "Blog (flux RSS)" },
  { value: "blog_url", label: "Blog (sans RSS)" },
];

const PLACEHOLDERS: Record<SourceType, string> = {
  youtube_playlist: "https://youtube.com/playlist?list=…",
  youtube_channel: "https://youtube.com/@chaine",
  blog_rss: "https://blog.example.com/feed",
  blog_url: "https://blog.example.com",
};

export default function Home() {
  const router = useRouter();
  const [rows, setRows] = useState<Source[]>([{ type: "youtube_playlist", url: "" }]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateRow(index: number, patch: Partial<Source>) {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function addRow() {
    setRows((prev) => [...prev, { type: "youtube_playlist", url: "" }]);
  }

  function removeRow(index: number) {
    setRows((prev) => prev.filter((_, i) => i !== index));
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    const sources = rows.filter((row) => row.url.trim() !== "");
    if (sources.length === 0) {
      setError("Ajoute au moins une source avec une URL.");
      return;
    }

    setSubmitting(true);
    try {
      const job = await createJob(sources);
      router.push(`/jobs/${job.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 p-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold tracking-tight">Thothly</h1>
        <p className="text-muted-foreground text-sm">
          Compile des sources YouTube et blogs en un EPUB pour ta liseuse.
        </p>
      </header>

      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-3">
          {rows.map((row, index) => (
            <div key={index} className="flex items-center gap-2">
              <select
                value={row.type}
                onChange={(e) => updateRow(index, { type: e.target.value as SourceType })}
                className="h-9 rounded-lg border border-border bg-background px-2 text-sm"
              >
                {SOURCE_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
              <input
                type="url"
                value={row.url}
                onChange={(e) => updateRow(index, { url: e.target.value })}
                placeholder={PLACEHOLDERS[row.type]}
                className="h-9 flex-1 rounded-lg border border-border bg-background px-3 text-sm"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => removeRow(index)}
                disabled={rows.length === 1}
                aria-label="Retirer la source"
              >
                ×
              </Button>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between">
          <Button type="button" variant="outline" size="sm" onClick={addRow}>
            + Ajouter une source
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Création…" : "Découvrir les sources"}
          </Button>
        </div>

        {error && <p className="text-destructive text-sm">{error}</p>}
      </form>
    </main>
  );
}
