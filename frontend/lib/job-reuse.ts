// Back from a review to the sources, then Review again: the job already made
// for exactly these sources is reopened instead of a twin being created (each
// one landed in the history as another "To review"). Anything changed, or a
// job that already moved past review, needs a new job.

export interface FromJob {
  id: string;
  // The staged sources' URLs, in order, as the workspace showed them on return.
  urls: string[];
  // The title the workspace showed on return.
  title: string;
}

export function reusableJob(
  from: FromJob | undefined,
  urls: string[],
  title: string,
  status: string | undefined,
): string | null {
  if (!from || status !== "reviewing") return null;
  const same =
    from.urls.length === urls.length &&
    from.urls.every((u, i) => u === urls[i]) &&
    from.title.trim() === title.trim();
  return same ? from.id : null;
}
