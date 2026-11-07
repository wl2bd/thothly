import { useEffect, useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  fetchCoverPreview,
  removeCoverImage,
  uploadCoverImage,
  type CoverEmblem,
  type CoverSettings,
  type CoverTint,
} from "@/lib/api";
import { cn } from "@/lib/utils";

// The cover's grounds, as the backend paints them (app/render/cover.py). These
// are the book's colours, not the app's, so they stay literal here.
const TINTS: { id: CoverTint; label: string; color: string }[] = [
  { id: "cream", label: "Cream", color: "oklch(0.972 0.013 84)" },
  { id: "stone", label: "Stone", color: "oklch(0.9 0.016 80)" },
  { id: "ink", label: "Ink", color: "oklch(0.2 0.01 60)" },
  { id: "gold", label: "Gold", color: "oklch(0.78 0.15 75)" },
];

const EMBLEMS: { id: CoverEmblem; label: string }[] = [
  { id: "source", label: "Source" },
  { id: "thothly", label: "Thothly" },
  { id: "none", label: "None" },
];

// A photo is scaled down in the browser before it leaves: the server fits it to
// 1600×2560 anyway, and the proxy in front of it caps request bodies.
const UPLOAD_MAX_SIDE = 2560;

async function shrink(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, UPLOAD_MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't read that image."))), "image/jpeg", 0.9),
  );
}

// The cover, set at review: a live thumbnail drawn by the server (so what you
// see is what lands in the EPUB), the text under the title, the ground (a tint
// or your own image, the title laid over it) and the emblem.
export function CoverEditor({
  jobId,
  title,
  selectedIds,
  cover,
  onCoverChange,
  hasImage,
  onHasImageChange,
  onUploadingChange,
}: {
  jobId: string;
  title: string;
  selectedIds: string[];
  cover: CoverSettings;
  onCoverChange: (cover: CoverSettings) => void;
  hasImage: boolean;
  onHasImageChange: (has: boolean) => void;
  // An image on its way up: Compile waits for it, or the book could miss it.
  onUploadingChange: (uploading: boolean) => void;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Bumped on each new image, so the thumbnail redraws even if nothing else moved.
  const [imageVersion, setImageVersion] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  // The thumbnail's blob URL, revoked when it is replaced or the pane goes.
  const urlRef = useRef<string | null>(null);

  const selectionKey = selectedIds.join(",");
  // The thumbnail is stale (dimmed) until it has been drawn for these settings.
  const wanted = JSON.stringify([title, cover, selectionKey, hasImage, imageVersion]);
  const [drawnFor, setDrawnFor] = useState<string | null>(null);
  const stale = drawnFor !== wanted;
  useEffect(() => {
    const controller = new AbortController();
    // Debounced: typing a subtitle redraws once the hand pauses.
    const timer = window.setTimeout(async () => {
      try {
        const blob = await fetchCoverPreview(
          jobId,
          { title, cover, selected_ids: selectionKey ? selectionKey.split(",") : [] },
          controller.signal,
        );
        if (urlRef.current) URL.revokeObjectURL(urlRef.current);
        urlRef.current = URL.createObjectURL(blob);
        setPreview(urlRef.current);
        setDrawnFor(wanted);
      } catch {
        // A failed thumbnail keeps the last one; the compile isn't affected.
        if (!controller.signal.aborted) setDrawnFor(wanted);
      }
    }, 350);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
    // `wanted` already folds every input in.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wanted, jobId]);

  useEffect(() => () => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
  }, []);

  const set = (patch: Partial<CoverSettings>) => onCoverChange({ ...cover, ...patch });

  async function onFile(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    onUploadingChange(true);
    setError(null);
    try {
      const job = await uploadCoverImage(jobId, await shrink(file));
      onHasImageChange(job.cover_image ?? true);
      setImageVersion((v) => v + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
      onUploadingChange(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function dropImage() {
    setError(null);
    try {
      const job = await removeCoverImage(jobId);
      onHasImageChange(job.cover_image ?? false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <section aria-labelledby="cover-heading" className="flex flex-col gap-3">
      <h3 id="cover-heading" className="text-sm font-medium">
        Cover
      </h3>
      <div className="flex gap-4">
        <div className="bg-muted relative aspect-[5/8] w-28 shrink-0 overflow-hidden rounded-sm shadow-sm ring-1 ring-black/5 dark:ring-white/10">
          {preview && (
            // eslint-disable-next-line @next/next/no-img-element -- a blob URL, nothing to optimise
            <img
              src={preview}
              alt="Cover preview"
              className={cn("size-full object-cover transition-opacity duration-200", stale && "opacity-60")}
            />
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <Input
            value={cover.subtitle ?? ""}
            onChange={(e) => set({ subtitle: e.target.value })}
            placeholder="Subtitle"
            aria-label="Subtitle"
            maxLength={120}
          />
          <Input
            value={cover.authors ?? ""}
            onChange={(e) => set({ authors: e.target.value })}
            placeholder="Authors, from the sources"
            aria-label="Authors, separated by commas"
            maxLength={200}
          />
          <p className="text-muted-foreground text-xs">Separate authors with commas.</p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <span className="text-muted-foreground text-xs">Background</span>
        <div className="flex items-center gap-2">
          {!hasImage &&
            TINTS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => set({ tint: t.id })}
                aria-label={t.label}
                aria-pressed={(cover.tint ?? "cream") === t.id}
                title={t.label}
                style={{ background: t.color }}
                className={cn(
                  "size-6 rounded-full ring-1 ring-black/15 transition-shadow outline-none focus-visible:ring-3 focus-visible:ring-ring/50 dark:ring-white/20",
                  (cover.tint ?? "cream") === t.id &&
                    "ring-primary ring-offset-card ring-2 ring-offset-2 dark:ring-primary",
                )}
              />
            ))}
          {hasImage ? (
            <Button type="button" variant="outline" size="xs" onClick={dropImage}>
              <X data-icon="inline-start" />
              Remove image
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              aria-label="Use your own image"
              title="Use your own image"
            >
              <ImagePlus />
            </Button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => void onFile(e.target.files?.[0])}
          />
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <span className="text-muted-foreground text-xs">Emblem</span>
        <div role="group" aria-label="Emblem" className="bg-muted flex rounded-lg p-0.5">
          {EMBLEMS.map((e) => {
            const on = (cover.emblem ?? "source") === e.id;
            return (
              <button
                key={e.id}
                type="button"
                aria-pressed={on}
                onClick={() => set({ emblem: e.id })}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                  on ? "bg-card text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {e.label}
              </button>
            );
          })}
        </div>
      </div>

      <p role="status" className="text-muted-foreground text-xs empty:hidden">
        {uploading ? "Adding your image…" : ""}
      </p>
      {error && (
        <p role="alert" className="text-destructive text-xs">
          {error}
        </p>
      )}
    </section>
  );
}
