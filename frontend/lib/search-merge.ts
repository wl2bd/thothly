// How a provider's batch joins the results already on screen.
//
// Providers answer one by one, each batch already ranked by the backend, with a
// 0-3 `relevance` every provider shares. Interleaving them by it gives one
// list ranked across types instead of videos, then articles, then episodes.
// It is a merge, not a sort: each batch keeps its own order (the triage ranks
// by more than relevance), and on a tie what is already shown stays first.
// Once the list is frozen (the user is about to act on it), a late batch only
// appends, so no row moves under the pointer.
//
// A row is picked by its URL, so two rows sharing one would check and uncheck
// together: the first one seen is kept.

type Row = { url: string; relevance?: number | null };

const score = (r: Row) => r.relevance ?? -1;

export function mergeBatch<T extends Row>(shown: T[], incoming: T[], frozen: boolean): T[] {
  const seen = new Set(shown.map((r) => r.url));
  const fresh: T[] = [];
  for (const r of incoming) {
    if (seen.has(r.url)) continue;
    seen.add(r.url);
    fresh.push(r);
  }
  if (frozen) return [...shown, ...fresh];
  const out: T[] = [];
  let i = 0;
  let j = 0;
  while (i < shown.length && j < fresh.length) {
    out.push(score(fresh[j]) > score(shown[i]) ? fresh[j++] : shown[i++]);
  }
  return out.concat(shown.slice(i), fresh.slice(j));
}
