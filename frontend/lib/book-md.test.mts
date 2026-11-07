import assert from "node:assert/strict";
import { test } from "node:test";

import { countWords, splitBook } from "./book-md.ts";

test("chapters come back by title, without the front matter or the attribution block", () => {
  const md = [
    "# Sources {.front-matter}",
    "- [A](https://a)",
    "# Préface {.front-matter}",
    "Bienvenue.",
    "# Stoïcisme {lang=fr}",
    "::: {.source-attribution}",
    "*Source: https://a*",
    ":::",
    "",
    "Le texte.",
    "# Second",
    "Body two.",
  ].join("\r\n");
  assert.deepEqual(splitBook(md), [
    { title: "Stoïcisme", body: "Le texte." },
    { title: "Second", body: "Body two." },
  ]);
});

test("a book from before the front-matter marker still skips its English headings", () => {
  assert.deepEqual(splitBook("# Sources\n\n- x\n\n# Preface\n\nHi.\n\n# A\n\nBody."), [
    { title: "A", body: "Body." },
  ]);
});

test("words are counted on whitespace", () => {
  assert.equal(countWords("  one two\nthree "), 3);
  assert.equal(countWords("   "), 0);
});

test("a chapter carries the link to its original, read from its attribution", () => {
  const md = [
    "# A post",
    "::: {.source-attribution}",
    "*Source: [https://quillnotes.example/p/a](https://quillnotes.example/p/a)* | *Author: Q*",
    ":::",
    "Text.",
  ].join("\n");
  assert.deepEqual(splitBook(md), [
    { title: "A post", body: "Text.", source: "https://quillnotes.example/p/a" },
  ]);
});
