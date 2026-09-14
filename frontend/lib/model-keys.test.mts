// Run with: node --test lib/model-keys.test.mts (Node 24 strips the types).
import { test } from "node:test";
import assert from "node:assert/strict";

import type { LlmConfig } from "./api.ts";
import { maskKey, parseModels, toVisitorEndpoint, withBrowserModels } from "./model-keys.ts";

const mistral = { provider: "mistral", apiKey: "sk-abcdef4f2c", model: "mistral-small-latest" };

test("nothing stored, or storage that isn't ours, reads as no models", () => {
  const empty = { llm: null, stt: null };
  assert.deepEqual(parseModels(null), empty);
  assert.deepEqual(parseModels("not json"), empty);
  assert.deepEqual(parseModels("[1,2]"), empty);
  assert.deepEqual(parseModels('{"llm":"sk-raw"}'), empty);
});

test("a complete endpoint survives, a partial one is dropped", () => {
  const raw = JSON.stringify({ llm: mistral, stt: { provider: "mistral", apiKey: "k" } });
  assert.deepEqual(parseModels(raw), { llm: mistral, stt: null });
});

test("a custom server may omit the key but must carry its address", () => {
  const custom = { provider: "custom", apiKey: "", model: "llama3", baseUrl: "http://127.0.0.1:11434/v1" };
  assert.deepEqual(parseModels(JSON.stringify({ llm: custom })).llm, custom);
  const noUrl = { provider: "custom", apiKey: "", model: "llama3" };
  assert.equal(parseModels(JSON.stringify({ llm: noUrl })).llm, null);
});

test("a known provider without a key is dropped", () => {
  const raw = JSON.stringify({ llm: { ...mistral, apiKey: "" } });
  assert.equal(parseModels(raw).llm, null);
});

test("the key is masked to its prefix and last four", () => {
  assert.equal(maskKey("sk-abcdef4f2c"), "sk-...4f2c");
  assert.equal(maskKey("short"), "••••");
  assert.equal(maskKey(""), "No key");
});

test("the confirm body uses the backend's field names", () => {
  assert.deepEqual(toVisitorEndpoint(mistral), {
    provider: "mistral",
    api_key: "sk-abcdef4f2c",
    model: "mistral-small-latest",
    base_url: undefined,
  });
});

const server: LlmConfig = {
  available: false,
  stt_available: false,
  roles: [],
  pricing: { stt_per_minute: 0.003, llm_per_mtok_in: 0.2, llm_per_mtok_out: 0.6 },
  providers: [
    { id: "openai", label: "OpenAI", llm_per_mtok_in: 0.15, llm_per_mtok_out: 0.6, stt_per_minute: 0.006 },
    { id: "mistral", label: "Mistral", llm_per_mtok_in: 0.2, llm_per_mtok_out: 0.6, stt_per_minute: 0.003 },
  ],
  custom_base_url_allowed: false,
};

test("a key in the browser makes the AI path available and quotes its provider", () => {
  const eff = withBrowserModels(server, {
    llm: { provider: "openai", apiKey: "sk-x1234567", model: "gpt-4o-mini" },
    stt: null,
  });
  assert.equal(eff?.available, true);
  assert.equal(eff?.stt_available, false);
  assert.equal(eff?.pricing.llm_per_mtok_in, 0.15);
  assert.equal(eff?.pricing.stt_per_minute, 0.003); // untouched: no browser STT
});

test("no browser key leaves the server's answer as it is", () => {
  assert.deepEqual(withBrowserModels(server, { llm: null, stt: null }), server);
  assert.equal(withBrowserModels(null, { llm: mistral, stt: null }), null);
});
