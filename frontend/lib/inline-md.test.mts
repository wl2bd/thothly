// Run with: node --test lib/inline-md.test.mts
import { test } from "node:test";
import assert from "node:assert/strict";

import { parseFigure, parseOrderedList, tokenizeInline } from "./inline-md.ts";

test("single asterisks are italics, not literal stars", () => {
  assert.deepEqual(tokenizeInline("or *logos*, a"), [
    { t: "text", text: "or " },
    { t: "em", children: [{ t: "text", text: "logos" }] },
    { t: "text", text: ", a" },
  ]);
});

test("italics can wrap a link", () => {
  assert.deepEqual(tokenizeInline("*[logos](https://x.example/Logos)*"), [
    { t: "em", children: [{ t: "link", text: "logos", href: "https://x.example/Logos" }] },
  ]);
});

test("bold still wins over italics, and a lone star stays text", () => {
  assert.deepEqual(tokenizeInline("**Stoicism** is 5 * 3"), [
    { t: "strong", text: "Stoicism" },
    { t: "text", text: " is 5 * 3" },
  ]);
});

test("links drop a trailing title, code stays verbatim", () => {
  assert.deepEqual(tokenizeInline('[a](https://a.example "A") `*x*`'), [
    { t: "link", text: "a", href: "https://a.example" },
    { t: "text", text: " " },
    { t: "code", text: "*x*" },
  ]);
});

test("superscripts and subscripts are their own tokens", () => {
  assert.deepEqual(tokenizeInline("H<sub>2</sub>O, XIX<sup>e</sup>"), [
    { t: "text", text: "H" },
    { t: "sub", children: [{ t: "text", text: "2" }] },
    { t: "text", text: "O, XIX" },
    { t: "sup", children: [{ t: "text", text: "e" }] },
  ]);
});

test("a backslash escape is the character itself, never markup", () => {
  assert.deepEqual(tokenizeInline("\\<div> and a\\*b\\*c"), [
    { t: "text", text: "<" },
    { t: "text", text: "div> and a" },
    { t: "text", text: "*" },
    { t: "text", text: "b" },
    { t: "text", text: "*" },
    { t: "text", text: "c" },
  ]);
});

test("a figure is an image alone in its block, its description the caption", () => {
  assert.deepEqual(parseFigure("![Ice near [Iceland](https://w.test/I), *2007*.](https://x.test/ice.jpg)"), {
    caption: "Ice near [Iceland](https://w.test/I), *2007*.",
    src: "https://x.test/ice.jpg",
  });
  assert.deepEqual(parseFigure("![](https://x.test/a.png)"), { caption: "", src: "https://x.test/a.png" });
  assert.equal(parseFigure("Text with ![a](https://x.test/a.png) inside"), null);
});

test("a numbered list gives its items, anything else gives null", () => {
  assert.deepEqual(parseOrderedList("1. Preheat\n2. Bake *well*"), ["Preheat", "Bake *well*"]);
  assert.equal(parseOrderedList("1999. A year that opens a sentence\nand goes on."), null);
  assert.equal(parseOrderedList("- Salt"), null);
});

test("a link title holding parentheses stays out of the text", () => {
  assert.deepEqual(
    tokenizeInline('the [attention](https://w.test/Attention_%28ml%29 "Attention (machine learning)") mechanism'),
    [
      { t: "text", text: "the " },
      { t: "link", text: "attention", href: "https://w.test/Attention_%28ml%29" },
      { t: "text", text: " mechanism" },
    ],
  );
});
