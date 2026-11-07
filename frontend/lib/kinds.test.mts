import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { backendKindOfUrl } from "./kinds.ts";

const { cases } = JSON.parse(
  readFileSync(new URL("../../fixtures/url-kinds.json", import.meta.url), "utf-8"),
) as { cases: [string, string][] };

test("a pasted URL reads as the backend reads it", () => {
  for (const [url, kind] of cases) assert.equal(backendKindOfUrl(url), kind, url);
});
