// A URL as people read it.

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function faviconUrl(url: string): string | null {
  const host = hostOf(url);
  return host ? `https://icons.duckduckgo.com/ip3/${host}.ico` : null;
}

// "youtube.com/@channel", "blog.example/posts/hello": the label of a source with
// no name yet. A watch URL keeps its identity in the `?v=` query, so its path
// would name every video alike; "YouTube video" is at least honest.
export function prettyUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const host = hostOf(url);
    if (host === "youtu.be" || (host.endsWith("youtube.com") && parsed.pathname === "/watch")) {
      return "YouTube video";
    }
    return `${host}${parsed.pathname.replace(/\/+$/, "")}`;
  } catch {
    return url;
  }
}

// What a source is called wherever it is listed: the name discovery captured,
// else its title, else its URL read as a label.
export function sourceName(source: { name?: string | null; title?: string | null; url: string }): string {
  return source.name?.trim() || source.title?.trim() || prettyUrl(source.url);
}
