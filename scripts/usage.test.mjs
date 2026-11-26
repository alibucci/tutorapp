/**
 * What a generation costs and how the costs add up: the sums behind the
 * admin's Usage page. Run with `npm run test:usage`.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { costOf, envSlug, smartReviewCost, summariseUsage, tokenPrice } from "../src/lib/usageCost.ts";

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-12, `${actual} is not ${expected}`);

const entry = (over) => ({
  at: "2026-11-20T10:00:00.000Z",
  purpose: "lesson_summary",
  provider: "deepseek",
  model: "deepseek-v4-pro",
  inputTokens: 0,
  outputTokens: 0,
  costUsd: 0,
  ok: true,
  ...over,
});

test("tokens are priced per million, input and output apart", () => {
  const env = { PRICE_DEEPSEEK_V4_PRO_IN: "1", PRICE_DEEPSEEK_V4_PRO_OUT: "4" };
  close(costOf({ meter: "tokens", model: "deepseek-v4-pro", inputTokens: 500_000, outputTokens: 250_000 }, env), 1.5);
});

test("an env price wins; a blank or nonsense one falls back to the table", () => {
  const table = tokenPrice("deepseek-v4-pro", {});
  assert.deepEqual(tokenPrice("deepseek-v4-pro", { PRICE_DEEPSEEK_V4_PRO_IN: "0.9" }), { ...table, in: 0.9 });
  assert.deepEqual(tokenPrice("deepseek-v4-pro", { PRICE_DEEPSEEK_V4_PRO_IN: "", PRICE_DEEPSEEK_V4_PRO_OUT: "cheap" }), table);
  assert.deepEqual(tokenPrice("deepseek-v4-pro", { PRICE_DEEPSEEK_V4_PRO_IN: "-1" }), table);
});

test("a model not in the table is still priced, not free", () => {
  const price = tokenPrice("deepseek-v9-experimental", {});
  assert.ok(price.in > 0 && price.out > 0);
  assert.equal(envSlug("deepseek-v9-experimental"), "DEEPSEEK_V9_EXPERIMENTAL");
  assert.equal(envSlug("wan2.6-t2i"), "WAN2_6_T2I");
});

test("pictures, audio and scores are priced by their own unit", () => {
  const env = { PRICE_IMAGE: "0.05", PRICE_ASR_PER_MIN: "0.006", PRICE_PRONOUNCE: "0.01" };
  close(costOf({ meter: "images", model: "wan2.6-t2i", units: 3 }, env), 0.15);
  close(costOf({ meter: "audio_seconds", model: "nova-3", units: 90 }, env), 0.009);
  close(costOf({ meter: "calls", model: "sent.eval.promax", units: 2 }, env), 0.02);
  // Nothing drawn, nothing heard: nothing paid.
  assert.equal(costOf({ meter: "images", model: "wan2.6-t2i", units: 0 }, env), 0);
  assert.equal(costOf({ meter: "audio_seconds", model: "nova-3" }, env), 0);
});

test("a summary adds up by purpose, model and student, failed calls apart", () => {
  const entries = [
    entry({ purpose: "lesson_summary", studentId: "a", inputTokens: 100, outputTokens: 50, costUsd: 0.01 }),
    entry({ purpose: "lesson_summary", studentId: "a", inputTokens: 100, outputTokens: 10, costUsd: 0.004, ok: false }),
    entry({ purpose: "lesson_homework", studentId: "b", inputTokens: 300, outputTokens: 200, costUsd: 0.03 }),
    entry({ purpose: "image", provider: "dashscope", model: "wan2.6-t2i", units: 3, costUsd: 0.09 }),
  ];
  const s = summariseUsage(entries);

  assert.equal(s.total.calls, 4);
  assert.equal(s.total.failed, 1);
  close(s.total.costUsd, 0.134);
  close(s.total.failedUsd, 0.004);
  assert.equal(s.total.inputTokens, 500);
  assert.equal(s.total.units, 3);

  // Dearest first.
  assert.deepEqual(s.byPurpose.map((r) => r.key), ["image", "lesson_homework", "lesson_summary"]);
  const summary = s.byPurpose.find((r) => r.key === "lesson_summary");
  assert.equal(summary.calls, 2);
  assert.equal(summary.failed, 1);
  assert.equal(summary.outputTokens, 60);

  assert.deepEqual(s.byModel.map((r) => r.key), ["dashscope/wan2.6-t2i", "deepseek/deepseek-v4-pro"]);

  // The picture was for nobody in particular: not a student's cost.
  assert.deepEqual(s.byStudent.map((r) => [r.key, r.calls]), [["b", 1], ["a", 2]]);
  close(s.byStudent.find((r) => r.key === "a").costUsd, 0.014);
});

test("per student per month keeps the months apart", () => {
  const s = summariseUsage([
    entry({ studentId: "a", costUsd: 0.02, at: "2026-10-31T23:00:00.000Z" }),
    entry({ studentId: "a", costUsd: 0.01, at: "2026-11-01T01:00:00.000Z" }),
    entry({ studentId: "a", costUsd: 0.01, at: "2026-11-02T01:00:00.000Z" }),
  ]);
  const byMonth = Object.fromEntries(s.byStudentMonth.map((r) => [r.month, [r.studentId, r.calls]]));
  assert.deepEqual(byMonth, { "2026-10": ["a", 1], "2026-11": ["a", 2] });
});

test("no calls is a summary of zeros, not an error", () => {
  const s = summariseUsage([]);
  assert.equal(s.total.calls, 0);
  assert.equal(s.total.costUsd, 0);
  assert.deepEqual(s.byPurpose, []);
  assert.equal(smartReviewCost([]), null);
});

test("a Smart Review costs what all its calls for that lesson cost, retries included", () => {
  const review = (lessonId, costUsd, ok = true) => entry({ purpose: "smart_review", lessonId, costUsd, ok });
  const result = smartReviewCost([
    review("L1", 0.02),
    review("L1", 0.01, false), // a thrown-away attempt is still paid for
    review("L2", 0.06),
    review("L3", 0.05, false), // never finished: not a review to average over
    entry({ purpose: "lesson_summary", lessonId: "L1", costUsd: 1 }), // not part of the review
    review(undefined, 9), // no lesson: cannot be counted per review
  ]);
  assert.equal(result.lessons, 2);
  close(result.totalUsd, 0.09);
  close(result.averageUsd, 0.045);
});
