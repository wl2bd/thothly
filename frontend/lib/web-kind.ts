// What a web URL most likely is, read from the URL alone. Search never fetches a
// page to label it (zero-network rule), so this is a shape heuristic: it must
// stay honest, which means "page" whenever there is no positive signal.
//
//   site         a bare home: discovery expands it into the site's posts (a container)
//   encyclopedia an entry in a reference work (Wikipedia, the Stanford Encyclopedia…)
//   discussion   a Q&A or forum thread: many voices, not one author's piece
//   article      a dated or blog-shaped post
//   page         everything else: docs, books, references, landing pages
export type WebKind = "site" | "encyclopedia" | "discussion" | "article" | "page";

// Language tags a site puts first in its paths (`/fr`, `/en-us`). Mirrors the
// backend's list in search/web_provider.py, which decides which homes are kept.
const LOCALES = new Set([
  "en", "fr", "de", "es", "it", "pt", "nl", "ru", "ja", "zh", "ar", "ko",
  "pl", "tr", "sv", "da", "no", "fi", "cs", "el", "he", "hi", "id", "th",
  "vi", "uk", "ro", "hu", "ca", "fa",
]);

const BLOG_HOSTS = ["substack.com", "medium.com", "hashnode.dev", "dev.to", "blogspot.com", "wordpress.com"];
const ENCYCLOPEDIA_HOSTS = [
  "wikipedia.org", "wiktionary.org", "wikibooks.org", "fandom.com",
  "plato.stanford.edu", "iep.utm.edu", "britannica.com", "larousse.fr", "universalis.fr",
];
const DISCUSSION_HOSTS = [
  "quora.com", "stackoverflow.com", "stackexchange.com", "superuser.com", "serverfault.com",
  "askubuntu.com", "news.ycombinator.com", "lobste.rs",
];
// A subdomain that serves reference material, never a blog: doc.rust-lang.org.
const PAGE_SUBDOMAINS = new Set(["doc", "docs", "book", "developer", "developers", "learn", "api", "wiki"]);

// A folder that holds posts: the segment after it is a post's slug.
const POST_FOLDERS = new Set(["blog", "blogs", "post", "posts", "article", "articles", "news", "p", "journal"]);
// A folder that holds reference material: whatever its slug looks like, it's a page.
const PAGE_FOLDERS = new Set(["docs", "doc", "documentation", "book", "guide", "guides", "reference", "api", "manual", "help", "support"]);
// A folder that holds threads (Discourse uses /t/slug/123).
const DISCUSSION_FOLDERS = new Set(["forum", "forums", "thread", "threads", "questions", "discussion", "discussions", "t"]);

function isLocale(segment: string): boolean {
  const parts = segment.toLowerCase().split("-");
  return parts.length <= 2 && LOCALES.has(parts[0]);
}

function safeDecode(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

function onHost(host: string, domains: string[]): boolean {
  return domains.some((d) => host === d || host.endsWith(`.${d}`));
}

export function webKind(url: string): WebKind {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return "page";
  }
  const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
  let segments = parsed.pathname.split("/").filter(Boolean).map(safeDecode);
  if (segments.length > 0 && isLocale(segments[0])) segments = segments.slice(1);

  const referenceHost = PAGE_SUBDOMAINS.has(host.split(".")[0]) && host.split(".").length > 2;
  // A reference subdomain's home is a book or a docs index, which has no feed
  // to unfold: it is one page, not a site.
  if (segments.length === 0) return referenceHost && host.split(".")[0] !== "wiki" ? "page" : "site";

  const lower = segments.map((s) => s.toLowerCase());
  if (onHost(host, ENCYCLOPEDIA_HOSTS) || lower[0] === "wiki" || host.split(".")[0] === "wiki") {
    return "encyclopedia";
  }
  if (onHost(host, DISCUSSION_HOSTS) || lower.some((s) => DISCUSSION_FOLDERS.has(s))) return "discussion";
  if (referenceHost || lower.some((s) => PAGE_FOLDERS.has(s))) return "page";

  if (onHost(host, BLOG_HOSTS)) return "article";
  // A year folder: /2024/03/slug.
  if (lower.some((s) => /^(19|20)\d{2}$/.test(s))) return "article";
  // A post folder with something after it (a bare /blog/ is the index).
  const folder = lower.findIndex((s) => POST_FOLDERS.has(s));
  if (folder !== -1 && folder < lower.length - 1) return "article";
  // A slug of four words or more reads as a post title.
  const slug = lower[lower.length - 1].replace(/\.html?$/, "");
  if (slug.split("-").filter(Boolean).length >= 4) return "article";

  return "page";
}
