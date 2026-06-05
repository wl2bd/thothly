"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { createJob } from "@/lib/api";

const INPUT_CLASS =
  "h-10 w-full rounded-lg border border-input bg-background px-3 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none";

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
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="flex w-full max-w-xl flex-col gap-6">
        <header className="flex flex-col items-center gap-2 text-center">
          <h1 className="text-4xl font-semibold tracking-tight">Thothly</h1>
          <p className="text-muted-foreground text-sm">
            Colle des liens YouTube (vidéo, playlist, chaîne) ou de blogs, et
            reçois un EPUB pour ta liseuse. Le type est détecté automatiquement.
          </p>
        </header>

        <form
          onSubmit={onSubmit}
          className="bg-card flex flex-col gap-5 rounded-xl border border-border p-6 shadow-sm"
        >
          <div className="flex flex-col gap-2">
            {urls.map((url, index) => (
              <div key={index} className="flex items-center gap-2">
                <input
                  type="text"
                  inputMode="url"
                  value={url}
                  onChange={(e) => updateUrl(index, e.target.value)}
                  placeholder="https://youtube.com/watch?v=…  ou  https://unblog.com"
                  className={INPUT_CLASS}
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
            <Button type="submit" size="lg" disabled={submitting}>
              {submitting ? "Création…" : "Découvrir les sources"}
            </Button>
          </div>

          {error && <p className="text-destructive text-sm">{error}</p>}
        </form>
      </div>
    </main>
  );
}
