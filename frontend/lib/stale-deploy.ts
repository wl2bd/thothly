// A tab opened before a deploy still runs the old build: the first time it
// needs a code chunk it asks for a file the new deploy no longer serves, and
// the page crashes. Reloading picks up the new build, so the error screen
// does that once on its own instead of showing.

const STALE_CHUNK =
  /ChunkLoadError|Loading (CSS )?chunk .* failed|Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i;

export function isStaleDeployError(error: { name?: string; message?: string }): boolean {
  return STALE_CHUNK.test(`${error.name ?? ""} ${error.message ?? ""}`);
}

const KEY = "thothly:stale-deploy-reload";
// Long enough to cover the reload itself, short enough that a later deploy
// on the same tab gets its own automatic reload.
const WINDOW_MS = 30_000;

// True when the page should reload: a stale-build error not already reloaded
// for in the last moments (a reload that didn't fix it must not loop). A pure
// read; markReload records the reload about to happen.
export function shouldReload(
  error: { name?: string; message?: string },
  storage: Pick<Storage, "getItem"> | null,
  now = Date.now(),
): boolean {
  if (!isStaleDeployError(error) || !storage) return false;
  try {
    const last = Number(storage.getItem(KEY));
    return !(last && now - last < WINDOW_MS);
  } catch {
    return false;
  }
}

export function markReload(storage: Pick<Storage, "setItem">, now = Date.now()): void {
  try {
    storage.setItem(KEY, String(now));
  } catch {
    // Unguarded: shouldReload already said storage works, so this is a race.
  }
}
