// Run with: node --test lib/web-kind.test.mts (Node 24 strips the types).
import { test } from "node:test";
import assert from "node:assert/strict";

import { webKind } from "./web-kind.ts";

test("a bare home, even localized, is a site (it expands to its posts)", () => {
  assert.equal(webKind("https://quillnotes.example/"), "site");
  assert.equal(webKind("https://www.quillnotes.example"), "site");
  assert.equal(webKind("https://quillnotes.example/fr/"), "site");
  assert.equal(webKind("https://quillnotes.example/en-us"), "site");
  // A query string doesn't make a home a page.
  assert.equal(webKind("https://quillnotes.example/?lang=fr"), "site");
});

test("an entry in a reference work is an encyclopedia entry, not an article", () => {
  assert.equal(webKind("https://en.wikipedia.org/wiki/Stoicism"), "encyclopedia");
  assert.equal(webKind("https://fr.m.wikipedia.org/wiki/Sto%C3%AFcisme"), "encyclopedia");
  assert.equal(webKind("https://lore.fandom.com/wiki/Some_Entry"), "encyclopedia");
  assert.equal(webKind("https://tool.example.org/wiki/Topic"), "encyclopedia");
  assert.equal(webKind("https://plato.stanford.edu/entries/stoicism/"), "encyclopedia");
  assert.equal(webKind("https://iep.utm.edu/stoicism/"), "encyclopedia");
});

test("a Q&A or forum thread is a discussion", () => {
  assert.equal(
    webKind("https://www.quora.com/What-is-stoicism-and-what-does-it-mean-to-live-a-stoic-life"),
    "discussion",
  );
  assert.equal(webKind("https://stackoverflow.com/questions/123/how-do-i-await-a-future"), "discussion");
  assert.equal(webKind("https://forum.example.org/t/on-reading-the-stoics/4521"), "discussion");
  assert.equal(webKind("https://quillnotes.example/forums/general/on-reading"), "discussion");
});

test("posts are articles: dated paths, post folders, blog platforms", () => {
  assert.equal(webKind("https://quillnotes.example/2024/03/on-reading"), "article");
  assert.equal(webKind("https://quillnotes.example/posts/on-reading"), "article");
  assert.equal(webKind("https://quillnotes.example/blog/on-reading"), "article");
  assert.equal(webKind("https://quillnotes.example/fr/blog/lire"), "article");
  assert.equal(webKind("https://quillnotes.example/news/a-thing-happened"), "article");
  assert.equal(webKind("https://someone.substack.com/p/on-reading"), "article");
  assert.equal(webKind("https://medium.com/@someone/on-reading-1a2b3c"), "article");
});

test("a long hyphenated slug reads as a post title", () => {
  assert.equal(
    webKind("https://quillnotes.example/what-most-people-get-wrong-about-stoicism"),
    "article",
  );
});

test("docs, references and the rest are pages", () => {
  assert.equal(webKind("https://lib.example.dev/docs/getting-started-with-the-library"), "page");
  assert.equal(webKind("https://lib.example.dev/reference/api"), "page");
  // A docs subdomain, even with a long hyphenated file name.
  assert.equal(webKind("https://doc.example-lang.org/book/ch17-00-async-await.html"), "page");
  assert.equal(webKind("https://docs.example.dev/getting-started-with-the-thing"), "page");
  // A book's home has no feed to unfold.
  assert.equal(webKind("https://book.example.rs/"), "page");
  assert.equal(webKind("https://quillnotes.example/about"), "page");
  assert.equal(webKind("https://quillnotes.example/pricing"), "page");
  // A blog index is a listing, not a post.
  assert.equal(webKind("https://quillnotes.example/blog/"), "page");
});

test("an unparseable URL falls back to a page", () => {
  assert.equal(webKind("not a url"), "page");
});
