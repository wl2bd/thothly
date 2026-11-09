// Run with: node --test lib/search-merge.test.mts (Node 24 strips the types).
import { test } from "node:test";
import assert from "node:assert/strict";

import { mergeBatch } from "./search-merge.ts";

const r = (id: string, relevance: number | null = null, url = `https://x/${id}`) => ({ id, url, relevance });
const ids = (rows: { id: string }[]) => rows.map((x) => x.id);

test("a later batch is interleaved by relevance, not stacked under the first", () => {
  const shown = [r("p1", 2.5), r("p2", 1.2)];
  const merged = mergeBatch(shown, [r("v1", 3), r("v2", 2)], false);
  assert.deepEqual(ids(merged), ["v1", "p1", "v2", "p2"]);
});

test("each batch keeps its own order, and ties keep what was already shown first", () => {
  // The triage orders a batch by more than relevance (level, freshness), so a
  // batch's internal order is never re-sorted.
  const merged = mergeBatch([r("p1", 2)], [r("v1", 2), r("v2", 2.5)], false);
  assert.deepEqual(ids(merged), ["p1", "v1", "v2"]);
});

test("once the list is frozen, a late batch only appends", () => {
  const merged = mergeBatch([r("p1", 1)], [r("v1", 3)], true);
  assert.deepEqual(ids(merged), ["p1", "v1"]);
});

test("a row whose URL is already shown is dropped", () => {
  const merged = mergeBatch([r("p1", 1, "https://same")], [r("w1", 3, "https://same"), r("w2", 0.5)], false);
  assert.deepEqual(ids(merged), ["p1", "w2"]);
});

test("a result without a relevance sorts after scored ones", () => {
  const merged = mergeBatch([r("p1", null)], [r("v1", 0.5)], false);
  assert.deepEqual(ids(merged), ["v1", "p1"]);
});
