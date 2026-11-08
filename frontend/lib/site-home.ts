// Whether a web URL is a site's home, read from the URL alone. Search never
// fetches a page to label it (zero-network rule), so this is a shape heuristic.
// A home is a collection: discovery reads its feed and unfolds it into posts.
// Anything else is one page.

// Language tags a site puts first in its paths (`/fr`, `/en-us`). Mirrors the
// backend's list in search/web_provider.py, which decides which homes are kept.
const LOCALES = new Set([
  "en", "fr", "de", "es", "it", "pt", "nl", "ru", "ja", "zh", "ar", "ko",
  "pl", "tr", "sv", "da", "no", "fi", "cs", "el", "he", "hi", "id", "th",
  "vi", "uk", "ro", "hu", "ca", "fa",
]);

// A subdomain that serves reference material, never a blog: its home is a book
// or a docs index, which has no feed to unfold.
const REFERENCE_SUBDOMAINS = new Set(["doc", "docs", "book", "developer", "developers", "learn", "api"]);

function isLocale(segment: string): boolean {
  const parts = segment.toLowerCase().split("-");
  return parts.length <= 2 && LOCALES.has(parts[0]);
}

export function isSiteHome(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  const labels = parsed.hostname.toLowerCase().replace(/^www\./, "").split(".");
  let segments = parsed.pathname.split("/").filter(Boolean);
  if (segments.length > 0 && isLocale(segments[0])) segments = segments.slice(1);
  if (segments.length > 0) return false;
  return !(labels.length > 2 && REFERENCE_SUBDOMAINS.has(labels[0]));
}
