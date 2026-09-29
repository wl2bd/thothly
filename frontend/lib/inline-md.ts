// The inline half of the reader's small Markdown renderer: bold, italics,
// links and code spans. Anything it doesn't know stays literal text.
export type InlineToken =
  | { t: "text"; text: string }
  | { t: "strong"; text: string }
  | { t: "em"; children: InlineToken[] }
  | { t: "link"; text: string; href: string }
  | { t: "code"; text: string };

// Italics need a non-space right after the opening star and right before the
// closing one, so "5 * 3" stays arithmetic.
const INLINE =
  /\*\*([^*]+)\*\*|\*(?=\S)([^*]*?\S)\*|\[([^\]]+)\]\(([^)]+)\)|`([^`]+)`/g;

export function tokenizeInline(text: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  const re = new RegExp(INLINE);
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) tokens.push({ t: "text", text: text.slice(last, m.index) });
    if (m[1] != null) tokens.push({ t: "strong", text: m[1] });
    else if (m[2] != null) tokens.push({ t: "em", children: tokenizeInline(m[2]) });
    // A Markdown link may carry a title after its URL: `(url "Title")`.
    else if (m[3] != null) tokens.push({ t: "link", text: m[3], href: m[4].replace(/\s+"[^"]*"$/, "") });
    else if (m[5] != null) tokens.push({ t: "code", text: m[5] });
    last = re.lastIndex;
  }
  if (last < text.length) tokens.push({ t: "text", text: text.slice(last) });
  return tokens;
}
