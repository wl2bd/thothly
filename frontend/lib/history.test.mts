// Run with: node --test lib/history.test.mts (Node 24 strips the types).
import { test } from "node:test";
import assert from "node:assert/strict";

import { groupBooks, parseHistory } from "./history.ts";

const at = (h: number) => new Date(Date.UTC(2026, 8, 30, h)).toISOString();
const book = (id: string, status: string, h: number) => ({ id, title: id, createdAt: at(h), status });

test("the source count is kept when valid, and an entry without one still reads", () => {
  const raw = JSON.stringify([
    { ...book("a", "completed", 1), sources: 3 },
    book("b", "reviewing", 2),
    { ...book("c", "completed", 3), sources: "3" },
  ]);
  const read = parseHistory(raw);
  assert.equal(read[0].sources, 3);
  assert.equal(read[1].sources, undefined);
  // A count that isn't a number is not trusted, but the book stays.
  assert.equal(read.length, 3);
  assert.equal(read[2].sources, undefined);
});

test("books split into In progress, To review, Ready and Did not finish, newest first in each", () => {
  const { inProgress, toReview, ready, failed } = groupBooks(
    parseHistory(
      JSON.stringify([
        book("old-ready", "completed", 1),
        book("review", "reviewing", 2),
        book("new-ready", "completed", 5),
        book("opening", "discovering", 4),
        book("failed", "failed", 3),
        book("compiling", "processing", 6),
      ]),
    ),
  );
  // Running on the server: nothing for you to do yet.
  assert.deepEqual(inProgress.map((b) => b.id), ["compiling", "opening"]);
  // Waiting on you.
  assert.deepEqual(toReview.map((b) => b.id), ["review"]);
  // Done, and only done.
  assert.deepEqual(ready.map((b) => b.id), ["new-ready", "old-ready"]);
  assert.deepEqual(failed.map((b) => b.id), ["failed"]);
});

test("an unparseable date sorts last instead of breaking the order", () => {
  const { ready } = groupBooks([
    { id: "bad", title: null, createdAt: "nope", status: "completed" },
    { id: "good", title: null, createdAt: at(1), status: "completed" },
  ]);
  assert.deepEqual(ready.map((b) => b.id), ["good", "bad"]);
});
