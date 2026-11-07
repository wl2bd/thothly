// Reading back the book Markdown the backend compiles (app/pipeline/models.py
// writes it; app/pipeline/audit.py split_chapters reads it the same way).

export type Chapter = { title: string; body: string };

// A book H1 as the compiler writes it: the title, then optional Pandoc
// attributes ("{lang=fr}" on a chapter, "{.front-matter}" on the Sources index
// and the preface, whose headings are in the book's language). Books compiled
// before the marker existed are recognised by their English headings.
function parseHeading(text: string): { title: string; frontMatter: boolean } {
  const m = /^(.*?)\s*\{([^{}]*)\}\s*$/.exec(text);
  const title = (m ? m[1] : text).trim();
  const attrs = m ? m[2] : "";
  return {
    title,
    frontMatter:
      attrs.includes(".front-matter") ||
      (!m && (title === "Sources" || title === "Preface")),
  };
}

// The book's Markdown as {title, body} per H1, the way the backend's
// `split_chapters` reads it. The "Sources" index is navigation, not reading;
// the source-attribution block (`:::`) is the compiler's, not the text.
export function splitBook(md: string): Chapter[] {
  const out: { title: string; frontMatter: boolean; body: string[] }[] = [];
  let fenced = false;
  // A book written on Windows comes back with CRLF; a stray "\r" defeats every
  // "$"-anchored pattern downstream.
  for (const line of md.replace(/\r\n?/g, "\n").split("\n")) {
    const h1 = /^#\s+(.*)/.exec(line);
    if (h1) {
      out.push({ ...parseHeading(h1[1]), body: [] });
      continue;
    }
    if (line.trim().startsWith(":::")) {
      fenced = !fenced;
      continue;
    }
    if (!fenced) out[out.length - 1]?.body.push(line);
  }
  return out
    .filter((c) => !c.frontMatter)
    .map((c) => ({ title: c.title, body: c.body.join("\n").trim() }));
}

export function countWords(text: string): number {
  const t = text.trim();
  return t ? t.split(/\s+/).length : 0;
}
