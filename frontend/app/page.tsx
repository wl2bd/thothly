"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { createJob } from "@/lib/api";

export default function Home() {
  const router = useRouter();
  const [urls, setUrls] = useState<string[]>([""]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateUrl(index: number, value: string) {
    setUrls((prev) => prev.map((url, i) => (i === index ? value : url)));
  }

  function addRow() {
    setUrls((prev) => [...prev, ""]);
  }

  function removeRow(index: number) {
    setUrls((prev) => prev.filter((_, i) => i !== index));
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    const sources = urls
      .map((url) => url.trim())
      .filter((url) => url !== "")
      .map((url) => ({ url }));

    if (sources.length === 0) {
      setError("Colle au moins un lien.");
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
          Colle des liens YouTube (vidéo, playlist, chaîne) ou de blogs — le type
          est détecté automatiquement.
        </p>
      </header>

      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          {urls.map((url, index) => (
            <div key={index} className="flex items-center gap-2">
              <input
                type="text"
                inputMode="url"
                value={url}
                onChange={(e) => updateUrl(index, e.target.value)}
                placeholder="https://youtube.com/watch?v=… ou https://unblog.com"
                className="h-9 flex-1 rounded-lg border border-border bg-background px-3 text-sm"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => removeRow(index)}
                disabled={urls.length === 1}
                aria-label="Retirer le lien"
              >
                ×
              </Button>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between">
          <Button type="button" variant="outline" size="sm" onClick={addRow}>
            + Ajouter un lien
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
