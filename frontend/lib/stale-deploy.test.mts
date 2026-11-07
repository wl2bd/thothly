import assert from "node:assert/strict";
import { test } from "node:test";

import { isStaleDeployError, markReload, shouldReload } from "./stale-deploy.ts";

function memory() {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
}

test("chunk failures from each bundler and browser count as a stale build", () => {
  assert.ok(isStaleDeployError({ name: "ChunkLoadError", message: "Loading chunk 123 failed." }));
  assert.ok(isStaleDeployError({ message: "Failed to fetch dynamically imported module: https://x/_next/a.js" }));
  assert.ok(isStaleDeployError({ message: "Importing a module script failed." }));
  assert.ok(isStaleDeployError({ message: "Loading CSS chunk 7 failed" }));
  assert.ok(!isStaleDeployError({ name: "TypeError", message: "Cannot read properties of undefined" }));
});

test("reloads once, then lets the error show if the reload didn't fix it", () => {
  const storage = memory();
  const error = { name: "ChunkLoadError", message: "Loading chunk 1 failed." };
  assert.equal(shouldReload(error, storage, 1_000), true);
  markReload(storage, 1_000);
  assert.equal(shouldReload(error, storage, 5_000), false);
  assert.equal(shouldReload(error, storage, 60_000), true);
});

test("never reloads for an ordinary bug, or without storage to guard the loop", () => {
  assert.equal(shouldReload({ message: "boom" }, memory()), false);
  assert.equal(shouldReload({ name: "ChunkLoadError" }, null), false);
});
