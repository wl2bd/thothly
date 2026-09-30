// Run with: node --test lib/shortcuts.test.mts (Node 24 strips the types).
import { test } from "node:test";
import assert from "node:assert/strict";

import { matches } from "./shortcuts.ts";

const k = (key: string, mods: { ctrl?: boolean; meta?: boolean; alt?: boolean } = {}) => ({
  key,
  ctrlKey: !!mods.ctrl,
  metaKey: !!mods.meta,
  altKey: !!mods.alt,
});

test("mod means Ctrl or Cmd, and is required when named", () => {
  assert.ok(matches("mod+enter", k("Enter", { ctrl: true })));
  assert.ok(matches("mod+enter", k("Enter", { meta: true })));
  assert.ok(!matches("mod+enter", k("Enter")));
});

test("a bare key refuses Ctrl, Cmd and Alt, so browser shortcuts stay theirs", () => {
  assert.ok(matches("a", k("a")));
  assert.ok(matches("a", k("A")));
  assert.ok(!matches("a", k("a", { ctrl: true })));
  assert.ok(!matches("c", k("c", { meta: true })));
  assert.ok(!matches("a", k("a", { alt: true })));
});

test("shifted symbols match by the character they type", () => {
  assert.ok(matches("?", k("?")));
  assert.ok(matches("arrowleft", k("ArrowLeft")));
});
