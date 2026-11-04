// The block half of the reader's small Markdown renderer, for the subset the
// compiler writes: headings, paragraphs, fenced code, blockquotes, bullet and
// numbered lists (nested by indentation), pipe tables and figures. Inline
// markup inside the text is left to tokenizeInline.
import { parseFigure } from "./inline-md.ts";

export type Block =
  | { t: "heading"; level: number; text: string }
  | { t: "paragraph"; text: string }
  | { t: "code"; text: string }
  | { t: "quote"; blocks: Block[] }
  | { t: "list"; ordered: boolean; items: ListItem[] }
  | { t: "table"; head: string[]; rows: string[][] }
  | { t: "figure"; caption: string; src: string };

export type ListItem = { text: string; blocks: Block[] };

const FENCE = /^\s*(```|~~~)/;
const HEADING = /^(#{1,6})\s+(.*)$/;
const MARKER = /^([-*]|\d+\.)\s+(.*)$/;

// Lines into chunks: a fenced block whole, a heading alone, everything else
// up to the next blank line.
function chunks(lines: string[]): string[][] {
  const out: string[][] = [];
  let current: string[] = [];
  const flush = () => {
    if (current.length) out.push(current);
    current = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fence = FENCE.exec(line);
    if (fence && !current.length) {
      const block = [line];
      while (++i < lines.length) {
        block.push(lines[i]);
        if (lines[i].trim().startsWith(fence[1])) break;
      }
      out.push(block);
      continue;
    }
    if (!line.trim()) flush();
    else if (HEADING.test(line)) {
      flush();
      out.push([line]);
    } else current.push(line);
  }
  flush();
  return out;
}

const indented = (line: string) => /^ {2,}\S/.test(line);
const dedent = (lines: string[]) => lines.map((l) => l.replace(/^ {1,4}/, ""));

function parseList(lines: string[]): Block | null {
  // Every line is an item or belongs to one by its indentation: a sentence
  // that happens to open with "1999." is a paragraph.
  if (!lines.every((l) => MARKER.test(l) || indented(l))) return null;
  const ordered = /^\d/.test(lines[0]);
  const items: ListItem[] = [];
  let inner: string[] = [];
  const close = () => {
    if (items.length && inner.length) items[items.length - 1].blocks.push(...parseBlocks(dedent(inner).join("\n")));
    inner = [];
  };
  for (const line of lines) {
    const m = MARKER.exec(line);
    if (m && !indented(line)) {
      close();
      items.push({ text: m[2], blocks: [] });
    } else inner.push(line);
  }
  close();
  return { t: "list", ordered, items };
}

// "| a | b \| c |" → ["a", "b | c"]: an escaped pipe is text, not a border.
function tableCells(line: string): string[] {
  return line
    .trim()
    .replace(/^\||\|$/g, "")
    .split(/(?<!\\)\|/)
    .map((cell) => cell.trim().replace(/\\\|/g, "|"));
}

function parseChunk(lines: string[]): Block {
  const first = lines[0];
  if (FENCE.test(first)) {
    const end = lines.length > 1 && FENCE.test(lines[lines.length - 1]) ? -1 : undefined;
    return { t: "code", text: lines.slice(1, end).join("\n") };
  }
  const heading = HEADING.exec(first);
  if (heading && lines.length === 1) return { t: "heading", level: heading[1].length, text: heading[2] };
  if (lines.every((l) => l.startsWith(">"))) {
    return { t: "quote", blocks: parseBlocks(lines.map((l) => l.replace(/^> ?/, "")).join("\n")) };
  }
  const figure = lines.length === 1 ? parseFigure(first) : null;
  if (figure) return { t: "figure", ...figure };
  if (lines.length > 1 && lines.every((l) => l.startsWith("|")) && /^\|[\s|:-]+$/.test(lines[1])) {
    const [head, , ...rows] = lines.map(tableCells);
    return { t: "table", head, rows };
  }
  const list = parseList(lines);
  if (list) return list;
  return { t: "paragraph", text: lines.join(" ") };
}

export function parseBlocks(md: string): Block[] {
  const blocks: Block[] = [];
  for (let lines of chunks(md.replace(/\r\n?/g, "\n").split("\n"))) {
    const last = blocks[blocks.length - 1];
    // Indented lines after a list continue its last item (a loose list's
    // second paragraph); a list right after a list of the same kind is one.
    if (last?.t === "list") {
      const n = lines.findIndex((l) => !indented(l));
      const cont = n === -1 ? lines : lines.slice(0, n);
      if (cont.length) {
        last.items[last.items.length - 1].blocks.push(...parseBlocks(dedent(cont).join("\n")));
        lines = lines.slice(cont.length);
        if (!lines.length) continue;
      }
    }
    const block = parseChunk(lines);
    if (block.t === "list" && last?.t === "list" && last.ordered === block.ordered) {
      last.items.push(...block.items);
      continue;
    }
    blocks.push(block);
  }
  return blocks;
}
