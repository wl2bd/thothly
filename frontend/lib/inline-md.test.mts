// Run with: node --test lib/inline-md.test.mts
import { test } from "node:test";
import assert from "node:assert/strict";

import { tokenizeInline } from "./inline-md.ts";

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
