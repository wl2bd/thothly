import { startTransition, useCallback, useEffect, useRef, useState } from "react";
import { ApiError, fetchJob, type JobResponse } from "@/lib/api";
import { recordCompilation } from "@/lib/history";

const ACTIVE_STATUSES = ["discovering", "processing"];

// A single failed poll must not kill the live view: the job is still running
// server-side, so a transient failure (5xx, a network blip) is retried with
// exponential backoff (2s, 4s, 8s, capped) up to MAX_POLL_FAILURES before an
// error is shown. A 4xx (e.g. an unknown compilation) is terminal and surfaced
// at once.
const BASE_POLL_MS = 2000;
const MAX_POLL_MS = 15000;
const MAX_POLL_FAILURES = 5;

// The job behind the page, kept live while it is working. Polling runs until
// the first answer, and again whenever the job is in an active status.
export function useJob(id: string) {
  const [job, setJob] = useState<JobResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const lastStatusRef = useRef<string | null>(null);
  const lastSnapshotRef = useRef<string | null>(null);
  // Animates the card (flow-card ViewTransition) only when the PHASE changes, so
  // each phase cross-fades while the frequent in-phase polls update instantly.
  const applyJob = useCallback((data: JobResponse) => {
    // Opening a job page is what puts it in this browser's history, so a link
    // someone shared joins your list and the title and status track the live
    // job. Guarded because every poll passes through here.
    const snapshot = JSON.stringify([data.book_title, data.status]);
    if (snapshot !== lastSnapshotRef.current) {
      lastSnapshotRef.current = snapshot;
      recordCompilation(data);
    }
    if (data.status !== lastStatusRef.current) {
      lastStatusRef.current = data.status;
      startTransition(() => setJob(data));
    } else {
      setJob(data);
    }
  }, []);

  const polling = job === null || ACTIVE_STATUSES.includes(job.status);

  useEffect(() => {
    if (!polling) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let failures = 0;

    // A self-scheduling poll (setTimeout, not setInterval) so the delay can grow
    // after a failure instead of hammering a struggling backend every 2s.
    async function tick(): Promise<void> {
      let nextDelay: number | null;
      try {
        const data = await fetchJob(id);
        if (cancelled) return;
        applyJob(data);
        failures = 0;
        nextDelay = ACTIVE_STATUSES.includes(data.status) ? BASE_POLL_MS : null;
      } catch (err) {
        if (cancelled) return;
        // Stay silent during retries; only surface an error once we truly give up.
        const terminal = err instanceof ApiError && err.status >= 400 && err.status < 500;
        failures += 1;
        if (terminal || failures >= MAX_POLL_FAILURES) {
          setError(err instanceof Error ? err.message : String(err));
          nextDelay = null;
        } else {
          nextDelay = Math.min(BASE_POLL_MS * 2 ** (failures - 1), MAX_POLL_MS);
        }
      }
      if (!cancelled && nextDelay != null) {
        timer = setTimeout(tick, nextDelay);
      }
    }

    tick();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [id, polling, applyJob]);

  return { job, error, applyJob };
}
