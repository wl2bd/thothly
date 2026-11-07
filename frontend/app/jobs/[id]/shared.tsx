import type { ButtonHTMLAttributes } from "react";
import { GripVertical } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { BackLink } from "@/components/back-link";
import { restoreJobDraft } from "@/lib/workspace-draft";
import type { Source } from "@/lib/api";

// Back to the workspace while the list can still change: the same sources and
// title come back there, and launching again starts a new compilation (this
// one stays in Your books).
export function BackToSources({
  jobId,
  sources,
  title,
}: {
  jobId: string;
  sources: Source[];
  title: string | null;
}) {
  return (
    <BackLink href="/" onNavigate={() => restoreJobDraft(jobId, sources, title || null)}>
      Sources
    </BackLink>
  );
}

export function StatusMessage({ label }: { label: string }) {
  return (
    <div className="text-muted-foreground flex items-center gap-3 text-sm">
      <Spinner />
      {label}
    </div>
  );
}

// The footer of a step that is working on its own: the primary action's place,
// saying what is happening.
export function WaitingButton({ label }: { label: string }) {
  return (
    <Button type="button" disabled className="w-full">
      {label}
    </Button>
  );
}

// The grip stays a 16px mark but sits in a 24x40 box: a bare button shrink-wraps
// its icon, which left a 16x16 target on the one control you have to catch AND
// drag. The box is real rather than a pseudo element because the checkbox next
// door already extends its own hit area 12px this way, and only a real box keeps
// the gap (and so the clearance between the two targets) as it grows. A group
// header and a single-item source row share it, so they keep one grip column.
export function DragGrip({ handleProps }: { handleProps: Record<string, unknown> }) {
  return (
    <button
      type="button"
      aria-label="Drag to reorder source"
      className="text-muted-foreground hover:text-foreground inline-grid h-10 w-6 shrink-0 cursor-grab place-items-center touch-none transition-colors active:cursor-grabbing"
      {...(handleProps as ButtonHTMLAttributes<HTMLButtonElement>)}
    >
      <GripVertical className="size-4" />
    </button>
  );
}
