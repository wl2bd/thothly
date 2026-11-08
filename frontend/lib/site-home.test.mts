import assert from "node:assert/strict";
import { test } from "node:test";

import { isSiteHome } from "./site-home.ts";

test("a bare home is a site, whatever its locale or query", () => {
  assert.equal(isSiteHome("https://quillnotes.example/"), true);
  assert.equal(isSiteHome("https://www.quillnotes.example"), true);
  assert.equal(isSiteHome("https://quillnotes.example/fr/"), true);
  assert.equal(isSiteHome("https://quillnotes.example/en-us"), true);
  assert.equal(isSiteHome("https://quillnotes.example/?lang=fr"), true);
  assert.equal(isSiteHome("https://wiki.example.org/"), true);
});

test("a reference subdomain's home is one page: it has no feed to unfold", () => {
  assert.equal(isSiteHome("https://book.example.rs/"), false);
  assert.equal(isSiteHome("https://docs.example.dev/"), false);
});

test("any path is one page", () => {
  assert.equal(isSiteHome("https://quillnotes.example/blog/"), false);
  assert.equal(isSiteHome("https://quillnotes.example/fr/blog/lire"), false);
  assert.equal(isSiteHome("https://en.wikipedia.org/wiki/Stoicism"), false);
  assert.equal(isSiteHome("https://quillnotes.example/about"), false);
});

test("a string that isn't a URL is not a site", () => {
  assert.equal(isSiteHome("not a url"), false);
});
