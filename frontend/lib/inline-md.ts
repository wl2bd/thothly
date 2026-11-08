// The inline half of the reader's small Markdown renderer: bold, italics,
// links, code spans, superscripts and subscripts (kept as <sup>/<sub> by the
// compiler), backslash escapes and TeX math between dollars. Anything it
// doesn't know stays literal text.
export type InlineToken =
  | { t: "text"; text: string }
  | { t: "strong"; text: string }
  | { t: "em"; children: InlineToken[] }
  | { t: "link"; text: string; href: string }
  | { t: "code"; text: string }
  | { t: "sup"; children: InlineToken[] }
  | { t: "sub"; children: InlineToken[] }
  | { t: "math"; tex: string; display: boolean }
  | { t: "noteref"; label: string };

// Italics need a non-space right after the opening star and right before the
// closing one, so "5 * 3" stays arithmetic.
// A backslash before ASCII punctuation is that character as text ("\<div>",
// "a\*b"): matched where it stands, it is consumed before a star can open
// italics.
// Math follows Pandoc's rule: "$$…$$" is display math; "$…$" needs a non-space
// inside both dollars and no digit after the closing one, so "$10 and $20"
// stays prices. Its TeX is verbatim: "\;" and "*" are not Markdown there.
// A footnote call, "[^c1fn1]", comes first: it has no "(url)" to be a link.
const INLINE =
  /\[\^([^\]\s]+)\]|\*\*([^*]+)\*\*|\*(?=\S)([^*]*?\S)\*|\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)|`([^`]+)`|\\([!-\/:-@[-`{-~])|<sup>(.*?)<\/sup>|<sub>(.*?)<\/sub>|\$\$([\s\S]+?)\$\$|\$(?=\S)([^$\n]*?\S)\$(?!\d)/g;

export function tokenizeInline(text: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  const re = new RegExp(INLINE);
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) tokens.push({ t: "text", text: text.slice(last, m.index) });
    if (m[1] != null) tokens.push({ t: "noteref", label: m[1] });
    else if (m[2] != null) tokens.push({ t: "strong", text: m[2] });
    else if (m[3] != null) tokens.push({ t: "em", children: tokenizeInline(m[3]) });
    // A Markdown link may carry a title after its URL, `(url "Title (x)")`:
    // the pattern matches it apart, parentheses and all, and drops it.
    else if (m[4] != null) tokens.push({ t: "link", text: m[4], href: m[5] });
    else if (m[6] != null) tokens.push({ t: "code", text: m[6] });
    else if (m[7] != null) tokens.push({ t: "text", text: m[7] });
    else if (m[8] != null) tokens.push({ t: "sup", children: tokenizeInline(m[8]) });
    else if (m[9] != null) tokens.push({ t: "sub", children: tokenizeInline(m[9]) });
    else if (m[10] != null) tokens.push({ t: "math", tex: m[10].trim(), display: true });
    else if (m[11] != null) tokens.push({ t: "math", tex: m[11], display: false });
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
