/**
 * How homework is scored: the one rule the tutor's page, the parent's page,
 * notices and Smart Review all read. Run with `npm run test:scoring`.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { gameScore, progressByTopic, resultScore } from "../src/lib/homework.ts";

const round = (right, answered = "x", extra = {}) => ({ asked: "q", answered, right, ...extra });
const result = (over) => ({ kind: "choose", topic: "Past tense", right: 0, total: 0, finishedAt: "2026-11-20T10:00:00Z", ...over });
const lesson = (results, sent = true) => ({ homework: { sentAt: sent ? "2026-11-20T09:00:00Z" : undefined, focus: "", exercises: [], results } });

test("homework not played is not 0%: it is no data", () => {
  assert.deepEqual(progressByTopic([lesson([])]), []);
  assert.equal(gameScore(lesson([]).homework).total, 0);
});

test("a spoken game where nothing was heard counts neither right nor wrong", () => {
  const r = result({
    kind: "dialogue",
    topic: "Say longer sentences",
    right: 0,
    total: 5,
    rounds: [1, 2, 3, 4, 5].map(() => round(false, "(nothing heard)", { skipped: true })),
  });
  assert.deepEqual(resultScore(r), { right: 0, total: 0 });
  assert.deepEqual(progressByTopic([lesson([r])]), []);
});

test("results saved before the rule (\"(nothing)\", counted wrong) are read correctly", () => {
  const legacy = result({
    kind: "dialogue",
    topic: "Say longer sentences",
    right: 1,
    total: 5,
    firstRight: 1,
    rounds: [round(true, "I like pizza"), ...[1, 2, 3, 4].map(() => round(false, "(nothing)"))],
  });
  assert.deepEqual(resultScore(legacy), { right: 1, total: 1 });
  assert.deepEqual(resultScore(legacy, "first"), { right: 1, total: 1 });
});

test("a wrong spoken answer still counts as wrong", () => {
  const r = result({ kind: "repeat", rounds: [round(false, "I goed home"), round(true, "I went home")] });
  assert.deepEqual(resultScore(r), { right: 1, total: 2 });
});

test("a replay does not improve the first-attempt picture", () => {
  const replayed = result({
    right: 5,
    total: 5,
    firstRight: 2,
    firstTotal: 5,
    attempts: 2,
    rounds: [1, 2, 3, 4, 5].map(() => round(true)),
  });
  assert.deepEqual(resultScore(replayed), { right: 5, total: 5 });
  assert.deepEqual(resultScore(replayed, "first"), { right: 2, total: 5 });
  const [topic] = progressByTopic([lesson([replayed])]);
  assert.equal(topic.percent, 40);
});

test("older replays with no first total never go over 100%", () => {
  const legacy = result({
    kind: "speak",
    right: 3,
    total: 5,
    firstRight: 3,
    rounds: [round(true, "yes"), round(true, "ok"), ...[1, 2, 3].map(() => round(false, "(nothing)"))],
  });
  const first = resultScore(legacy, "first");
  assert.ok(first.right <= first.total, JSON.stringify(first));
});

test("\"What would you do?\" never counts for or against", () => {
  const r = result({ kind: "kindness", right: 3, total: 3, rounds: [round(true)] });
  assert.deepEqual(resultScore(r), { right: 0, total: 0 });
});

test("topics add up across homework, weakest first", () => {
  const a = result({ topic: "Plurals", rounds: [round(true), round(false)] });
  const b = result({ topic: "Past tense", rounds: [round(true), round(true)] });
  const c = result({ topic: "Plurals", rounds: [round(false), round(false)] });
  const t = progressByTopic([lesson([a, b]), lesson([c])]);
  assert.deepEqual(t.map((x) => [x.topic, x.right, x.total]), [["Plurals", 1, 4], ["Past tense", 2, 2]]);
});
