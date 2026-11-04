// Run with: node --test lib/md-blocks.test.mts
import { test } from "node:test";
import assert from "node:assert/strict";

import { parseBlocks } from "./md-blocks.ts";

test("a fenced code block is one block, blank lines and # lines included", () => {
  const md = "Intro.\n\n```\nz ← f(x)\n\n# not a heading\n    indented\n```\n\nAfter.";
  assert.deepEqual(parseBlocks(md), [
    { t: "paragraph", text: "Intro." },
    { t: "code", text: "z ← f(x)\n\n# not a heading\n    indented" },
    { t: "paragraph", text: "After." },
  ]);
});

test("a heading is its own block even with no blank line after it", () => {
  assert.deepEqual(parseBlocks("## Title\nFirst sentence\nsecond line."), [
    { t: "heading", level: 2, text: "Title" },
    { t: "paragraph", text: "First sentence second line." },
  ]);
});

test("a blockquote holds its own blocks", () => {
  assert.deepEqual(parseBlocks("> First *line*\n> goes on.\n>\n> Second."), [
    {
      t: "quote",
      blocks: [
        { t: "paragraph", text: "First *line* goes on." },
        { t: "paragraph", text: "Second." },
      ],
    },
  ]);
});

test("a list item keeps its nested list and its indented paragraph", () => {
  const md = "- Family\n  - Derived\n- Version\n\n  More on versions.\n- Stage";
  assert.deepEqual(parseBlocks(md), [
    {
      t: "list",
      ordered: false,
      items: [
        { text: "Family", blocks: [{ t: "list", ordered: false, items: [{ text: "Derived", blocks: [] }] }] },
        { text: "Version", blocks: [{ t: "paragraph", text: "More on versions." }] },
        { text: "Stage", blocks: [] },
      ],
    },
  ]);
});

test("numbered lists, figures and tables", () => {
  const md = "1. One\n2. Two\n\n![Cap with [a](https://a.test).](https://x.test/i.png)\n\n| A | B \\| c |\n| --- | --- |\n| 1 | 2 |";
  assert.deepEqual(parseBlocks(md), [
    { t: "list", ordered: true, items: [{ text: "One", blocks: [] }, { text: "Two", blocks: [] }] },
    { t: "figure", caption: "Cap with [a](https://a.test).", src: "https://x.test/i.png" },
    { t: "table", head: ["A", "B | c"], rows: [["1", "2"]] },
  ]);
});

test("a line opening with a year is a paragraph, not a list", () => {
  assert.deepEqual(parseBlocks("1999. A year that opens a sentence\nand goes on."), [
    { t: "paragraph", text: "1999. A year that opens a sentence and goes on." },
  ]);
});
