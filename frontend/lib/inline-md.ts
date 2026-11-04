// The inline half of the reader's small Markdown renderer: bold, italics,
// links, code spans, superscripts and subscripts (kept as <sup>/<sub> by the
// compiler) and backslash escapes. Anything it doesn't know stays literal text.
export type InlineToken =
  | { t: "text"; text: string }
  | { t: "strong"; text: string }
  | { t: "em"; children: InlineToken[] }
  | { t: "link"; text: string; href: string }
  | { t: "code"; text: string }
  | { t: "sup"; children: InlineToken[] }
  | { t: "sub"; children: InlineToken[] };

// Italics need a non-space right after the opening star and right before the
// closing one, so "5 * 3" stays arithmetic.
// A backslash before ASCII punctuation is that character as text ("\<div>",
// "a\*b"): matched where it stands, it is consumed before a star can open
// italics.
const INLINE =
  /\*\*([^*]+)\*\*|\*(?=\S)([^*]*?\S)\*|\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)|`([^`]+)`|\\([!-\/:-@[-`{-~])|<sup>(.*?)<\/sup>|<sub>(.*?)<\/sub>/g;

export function tokenizeInline(text: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  const re = new RegExp(INLINE);
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) tokens.push({ t: "text", text: text.slice(last, m.index) });
    if (m[1] != null) tokens.push({ t: "strong", text: m[1] });
    else if (m[2] != null) tokens.push({ t: "em", children: tokenizeInline(m[2]) });
    // A Markdown link may carry a title after its URL, `(url "Title (x)")`:
    // the pattern matches it apart, parentheses and all, and drops it.
    else if (m[3] != null) tokens.push({ t: "link", text: m[3], href: m[4] });
    else if (m[5] != null) tokens.push({ t: "code", text: m[5] });
    else if (m[6] != null) tokens.push({ t: "text", text: m[6] });
    else if (m[7] != null) tokens.push({ t: "sup", children: tokenizeInline(m[7]) });
    else if (m[8] != null) tokens.push({ t: "sub", children: tokenizeInline(m[8]) });
    last = re.lastIndex;
  }
  if (last < text.length) tokens.push({ t: "text", text: text.slice(last) });
  return tokens;
}

// A figure as the compiler writes it: an image alone in its block, its
// description the caption (Pandoc's implicit figure). The caption can hold
// links, so one level of [brackets] inside it belongs to it.
const FIGURE = /^!\[((?:[^[\]]|\[[^[\]]*\])*)\]\((\S+?)\)$/;

export function parseFigure(block: string): { caption: string; src: string } | null {
  const m = FIGURE.exec(block.trim());
  return m ? { caption: m[1], src: m[2] } : null;
}

// "1. a\n2. b" → ["a", "b"]; null unless every line is a numbered item.
export function parseOrderedList(block: string): string[] | null {
  const lines = block.trim().split("\n");
  const items = lines.map((l) => /^\s*\d+\.\s+(.*)$/.exec(l)?.[1]);
  return items.every((i) => i != null) ? (items as string[]) : null;
}
