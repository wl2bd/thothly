import assert from "node:assert/strict";
import { test } from "node:test";

import type { DiscoveredItem, LlmConfig } from "./api.ts";
import {
  autoTitleForSelection,
  defaultSelection,
  costLabel,
  episodeCost,
  estimateCost,
  formatUsd,
  isFinished,
  isLeftOut,
  isLeftOutState,
  orderedSelection,
  sureItems,
  toggled,
  withIds,
} from "./review.ts";
import { sourceName } from "./url.ts";

let n = 0;
function item(fields: Partial<DiscoveredItem>): DiscoveredItem {
  n += 1;
  return {
    id: `i${n}`, title: `Item ${n}`, url: `https://x/${n}`, item_type: "youtube",
    source_index: 0, item_index: n, uncertain: false, paywalled: false, unreadable: false, selected: false,
    transcript_tracks: [], ...fields,
  };
}

const llm = {
  available: true,
  stt_available: true,
  podcast_transcripts: false,
  roles: [],
  providers: [],
  custom_base_url_allowed: false,
  pricing: { stt_per_minute: 0.01, llm_per_mtok_in: 1, llm_per_mtok_out: 1 },
} as LlmConfig;

test("doubted, uncertain and far-down episodes start unselected", () => {
  const keep = item({});
  const doubted = item({ set_aside: "Likely off-topic" });
  const unsure = item({ item_type: "blog", uncertain: true });
  const early = item({ item_type: "podcast", item_index: 3 });
  const late = item({ item_type: "podcast", item_index: 10 });
  assert.deepEqual([...defaultSelection([keep, doubted, unsure, early, late])], [keep.id, early.id]);
});

test("'all' leaves uncertain links out, unless that's all there is", () => {
  const sure = item({});
  const unsure = item({ uncertain: true });
  assert.deepEqual(sureItems([sure, unsure]), [sure]);
  assert.deepEqual(sureItems([unsure]), [unsure]);
});

test("a lone source names the book; several are counted", () => {
  const a = item({ source_index: 0 });
  const b = item({ source_index: 1 });
  const job = {
    discovered_items: [a, b],
    sources: [{ url: "https://a", name: "Stoa Talks" }, { url: "https://b" }],
  } as never;
  assert.equal(autoTitleForSelection(job, new Set([a.id])), "Stoa Talks");
  assert.equal(autoTitleForSelection(job, new Set([a.id, b.id])), "Compilation of 2 sources");
  assert.equal(autoTitleForSelection(job, new Set()), null);
  // An unnamed lone source is counted, never titled after its URL.
  assert.equal(autoTitleForSelection(job, new Set([b.id])), "Compilation of 1 source");
});

test("chapters follow the visitor's source order, then the source's own", () => {
  const a2 = item({ source_index: 0, item_index: 2 });
  const a1 = item({ source_index: 0, item_index: 1 });
  const b1 = item({ source_index: 1, item_index: 1 });
  const ids = orderedSelection([a2, a1, b1], [1, 0], new Set([a2.id, a1.id, b1.id]));
  assert.deepEqual(ids, [b1.id, a1.id, a2.id]);
});

test("an episode is left out only while nothing can transcribe it", () => {
  const episode = item({ item_type: "podcast" });
  assert.equal(isLeftOut(episode, true), true);
  assert.equal(isLeftOut(episode, false), false);
  assert.equal(isLeftOut(item({ has_transcript: false }), false), true);
});

test("the estimate counts transcription and one pass per role, punctuation only on raw captions", () => {
  const raw = item({ has_transcript: true, is_punctuated: false, word_count: 1_000_000 / 1.33 });
  const clean = item({ has_transcript: true, is_punctuated: true, word_count: 1_000_000 / 1.33 });
  const episode = item({ item_type: "podcast", estimated_duration_s: 600 });
  const all = new Set([raw.id, clean.id, episode.id]);

  const cost = estimateCost([raw, clean, episode], all, new Set(["punctuate"]), llm);
  assert.equal(Math.round(cost.llm * 100) / 100, 2); // raw captions only: 1M tokens in + out
  assert.equal(Math.round(cost.stt * 100) / 100, 0.1);
  assert.deepEqual(estimateCost([raw], all, new Set(), null), { stt: 0, llm: 0 });
});

test("an episode's price is its exact length at the per-minute rate, and only when it needs transcribing", () => {
  const pricing = llm.pricing;
  const episode = item({ item_type: "podcast", estimated_duration_s: 90 });
  assert.equal(episodeCost(episode, pricing), 0.015);
  assert.equal(episodeCost(item({ item_type: "podcast", has_transcript: true, estimated_duration_s: 90 }), pricing), 0);
  assert.equal(episodeCost(item({ word_count: 10 }), pricing), 0);
  assert.equal(estimateCost([episode], new Set([episode.id]), new Set(), llm).stt, 0.015);
});

test("compile states: finished means a verdict, left out means no chapter", () => {
  assert.deepEqual(
    (["pending", "compiling", "done", "skipped", "failed", null] as const).map(isFinished),
    [false, false, true, true, true, false],
  );
  assert.deepEqual(
    (["done", "skipped", "failed", undefined] as const).map(isLeftOutState),
    [false, true, true, false],
  );
});

test("sets are toggled and bulk-set without touching the original", () => {
  const base = new Set(["a"]);
  assert.deepEqual([...toggled(base, "b")], ["a", "b"]);
  assert.deepEqual([...toggled(base, "a")], []);
  assert.deepEqual([...withIds(base, ["b", "c"], true)], ["a", "b", "c"]);
  assert.deepEqual([...withIds(base, ["a", "z"], false)], []);
  assert.deepEqual([...base], ["a"]);
});

test("money: a total under a cent is never approximated", () => {
  assert.equal(formatUsd(0), "$0.00");
  assert.equal(formatUsd(0.004, { approx: true }), "< $0.01");
  assert.equal(formatUsd(0.5), "$0.50");
  assert.equal(formatUsd(0.5, { approx: true }), "~$0.50");
  assert.equal(costLabel({ stt: 0, llm: 0 }), null);
});

test("a source is called by its name, else its title, else its URL", () => {
  assert.equal(sourceName({ name: " Chan ", title: "T", url: "https://x.example/a" }), "Chan");
  assert.equal(sourceName({ name: "", title: "T", url: "https://x.example/a" }), "T");
  assert.equal(sourceName({ url: "https://www.x.example/a/" }), "x.example/a");
});

test("a paid post is left out, a free one is not", () => {
  assert.equal(isLeftOut(item({ item_type: "blog", paywalled: true }), false), true);
  assert.equal(isLeftOut(item({ item_type: "blog" }), false), false);
  assert.equal(isLeftOut(item({ item_type: "blog", unreadable: true }), false), true);
});
