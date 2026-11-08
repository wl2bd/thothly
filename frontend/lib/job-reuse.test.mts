// Run with: node --test lib/job-reuse.test.mts (Node 24 strips the types).
import { test } from "node:test";
import assert from "node:assert/strict";

import { reusableJob } from "./job-reuse.ts";

const from = { id: "j1", urls: ["https://a.example/1", "https://b.example/2"], title: "Stoicism" };

test("the same sources, in the same order, under the same title reopen the job", () => {
  assert.equal(reusableJob(from, from.urls, "Stoicism", "reviewing"), "j1");
  // Spaces around the title are not a change.
  assert.equal(reusableJob(from, from.urls, " Stoicism ", "reviewing"), "j1");
});

test("any change to the sources or the title starts a new job", () => {
  assert.equal(reusableJob(from, [...from.urls, "https://c.example/3"], "Stoicism", "reviewing"), null);
  assert.equal(reusableJob(from, [...from.urls].reverse(), "Stoicism", "reviewing"), null);
  assert.equal(reusableJob(from, from.urls, "Stoics", "reviewing"), null);
});

test("a job past review, or unknown, is never reopened", () => {
  assert.equal(reusableJob(from, from.urls, "Stoicism", "completed"), null);
  assert.equal(reusableJob(from, from.urls, "Stoicism", undefined), null);
  assert.equal(reusableJob(undefined, from.urls, "Stoicism", "reviewing"), null);
});
