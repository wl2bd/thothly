import { useCallback, useState } from "react";

import { toVisitorEndpoint } from "@/lib/model-keys";
import { useStoredModels } from "@/lib/use-stored-models";
import {
  autoTitleForSelection,
  defaultSelection,
  orderedSelection,
  sureItems,
  toggled,
  withIds,
} from "@/lib/review";
import { confirmJob, type CoverSettings, type JobResponse } from "@/lib/api";

// The review step's state: what is selected, the book's name, the AI polish
// roles, the compile order of the sources, and the confirm that starts the
// compile. It mounts only while the job is in review, so it starts from the job.
export function useReview(
  job: JobResponse,
  onConfirmed: (job: JobResponse) => void,
) {
  const [initial] = useState(() => defaultSelection(job.discovered_items));
  const [selected, setSelected] = useState(initial);
  // A title typed in the workspace is the user's own: keep it, frozen.
  const named = !!(job.title_named && job.book_title);
  const [title, setTitle] = useState(() =>
    named ? (job.book_title ?? "") : (autoTitleForSelection(job, initial) ?? ""),
  );
  // While auto, the title tracks the selection; the first manual edit freezes it.
  const [titleIsAuto, setTitleIsAuto] = useState(!named);
  const [titleSyncedFor, setTitleSyncedFor] = useState<Set<string>>(initial);
  const [roles, setRoles] = useState<Set<string>>(new Set());
  // Source indices in display order, drag-reorderable; they compile in this order.
  const [sourceOrder, setSourceOrder] = useState(() =>
    [...new Set(job.discovered_items.map((it) => it.source_index))].sort((a, b) => a - b),
  );
  const [cover, setCover] = useState<CoverSettings>({ emblem: "source", tint: "cream" });
  const [coverImage, setCoverImage] = useState(!!job.cover_image);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const storedModels = useStoredModels();

  // Adjust state during render (no effect): deselecting a whole source drops the
  // count, leaving a single source swaps to its name.
  if (titleIsAuto && selected !== titleSyncedFor) {
    setTitleSyncedFor(selected);
    const next = autoTitleForSelection(job, selected);
    if (next !== null) setTitle(next);
  }

  const onTitleChange = useCallback((value: string) => {
    setTitle(value);
    setTitleIsAuto(false);
  }, []);

  const selectItems = useCallback(
    (ids: string[], value: boolean) => setSelected((prev) => withIds(prev, ids, value)),
    [],
  );
  const toggle = useCallback((itemId: string) => setSelected((prev) => toggled(prev, itemId)), []);
  const toggleRole = useCallback((roleId: string) => setRoles((prev) => toggled(prev, roleId)), []);

  // The AI polish master switch turns its whole safe set on, or clears every
  // opt-in pass off, in one move.
  const setRolesMany = useCallback(
    (ids: string[], value: boolean) => setRoles((prev) => withIds(prev, ids, value)),
    [],
  );

  const selectAll = () =>
    setSelected(new Set(sureItems(job.discovered_items).map((it) => it.id)));
  const selectNone = () => setSelected(new Set());

  async function confirm() {
    setConfirming(true);
    setError(null);
    // A stored key only travels when this compilation will use it: the model
    // with AI polish on, transcription with a podcast selected.
    const podcastSelected = job.discovered_items.some(
      (it) => selected.has(it.id) && it.item_type === "podcast",
    );
    const visitor = {
      llm: roles.size > 0 && storedModels.llm ? toVisitorEndpoint(storedModels.llm) : undefined,
      stt: podcastSelected && storedModels.stt ? toVisitorEndpoint(storedModels.stt) : undefined,
    };
    try {
      const updated = await confirmJob(
        job.id,
        orderedSelection(job.discovered_items, sourceOrder, selected),
        title.trim() || undefined,
        [...roles],
        visitor,
        cover,
      );
      onConfirmed(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setConfirming(false);
    }
  }

  return {
    selected,
    title,
    roles,
    sourceOrder,
    confirming,
    error,
    onTitleChange,
    toggle,
    selectItems,
    selectAll,
    selectNone,
    toggleRole,
    setRolesMany,
    setSourceOrder,
    cover,
    setCover,
    coverImage,
    setCoverImage,
    confirm,
  };
}
