"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
    <main className="flex min-h-screen items-center justify-center p-8 sm:p-12">
      <div className="flex w-full max-w-xl flex-col gap-12">
        <header className="flex flex-col items-center gap-3 text-center">
          <h1 className="font-heading text-5xl font-semibold tracking-tight text-foreground">
            Thothly
          </h1>
          <p className="text-muted-foreground max-w-md text-pretty text-[0.95rem] leading-relaxed">
            Colle des liens YouTube (vidéo, playlist, chaîne) ou de blogs, et
            reçois un EPUB soigné pour ta liseuse. Le type est détecté
            automatiquement.
          </p>
        </header>

        <Card>
          <CardContent>
            <form onSubmit={onSubmit} className="flex flex-col gap-7">
              <div className="flex flex-col gap-3">
                {urls.map((url, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <Input
                      type="text"
                      inputMode="url"
                      value={url}
                      onChange={(e) => updateUrl(index, e.target.value)}
                      placeholder="https://youtube.com/watch?v=…  ou  https://unblog.com"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeRow(index)}
                      disabled={urls.length === 1}
                      aria-label="Retirer le lien"
                    >
                      <XIcon />
                    </Button>
                  </div>
                ))}

                <Button
                  type="button"
                  variant="outline"
                  onClick={addRow}
                  className="text-muted-foreground w-full justify-center border-dashed"
                >
                  + Ajouter un lien
                </Button>
              </div>

              <Button
                type="submit"
                size="lg"
                disabled={submitting}
                className="w-full"
              >
                {submitting ? "Création…" : "Découvrir les sources"}
              </Button>

              {error && <p className="text-destructive text-sm">{error}</p>}
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
