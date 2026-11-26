/**
 * The pilot's numbers on a fixed clock. Run with `npm test`.
 */
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";

// pilot.ts imports its neighbours without ".ts", as the app's bundler reads them.
registerHooks({
  resolve(specifier, context, next) {
    try {
      return next(specifier, context);
    } catch (e) {
      if (specifier.startsWith(".") && !specifier.endsWith(".ts")) return next(`${specifier}.ts`, context);
      throw e;
    }
  },
});

const { pilotReport, pilotMonths } = await import("../src/lib/pilot.ts");

// Monday 23 Nov 2026 in Shanghai.
const START = "2026-11-23";
const NOW = Date.UTC(2026, 11, 20); // well after three weeks
const at = (day, h = 10) => new Date(Date.UTC(2026, 10, 23 + day, h - 8)).toISOString(); // Shanghai wall clock

const round = (right, extra = {}) => ({ asked: "q", answered: "a", right, ...extra });
const game = (finishedAt, rounds, extra = {}) => ({ kind: "choose", topic: "t", right: rounds.filter((r) => r.right).length, total: rounds.length, finishedAt, rounds, ...extra });
const lesson = (id, sentDay, results, extra = {}) => ({
  id,
  studentId: "s",
  title: id,
  createdAt: at(sentDay, 9),
  homework: { sentAt: at(sentDay, 9), focus: "", exercises: results.map(() => ({ kind: "choose", rounds: [] })), results },
  ...extra,
});
const student = (skills = []) => ({ id: "s", name: "V", skills, schedule: { timezone: "Asia/Shanghai" } });

test("three weeks from the start, plus the whole of it", () => {
  const r = pilotReport(student(), [], [], START, 3, NOW);
  assert.equal(r.weeks.length, 3);
  assert.equal(r.weeks[0].key, "2026-11-23"); // the learner's Monday, not UTC's Sunday
  assert.match(r.weeks[0].label, /23 Nov - 29 Nov/);
});

test("finished out of sent, and the time it took", () => {
  const done = lesson("a", 0, [game(at(0, 21), [round(true), round(false)])]);
  const open = lesson("b", 2, []);
  open.homework.exercises = [{ kind: "choose", rounds: [] }];
  const r = pilotReport(student(), [done, open], [], START, 1, NOW);
  assert.equal(r.weeks[0].sent, 2);
  assert.equal(r.weeks[0].finished, 1);
  assert.equal(r.weeks[0].hoursToFinish, 12);
  assert.deepEqual(r.weeks[0].firstGo, { right: 1, total: 2 });
});

test("an unplayed game is never a wrong answer, and a replay says nothing new", () => {
  const replay = lesson("a", 1, [game(at(1, 20), [round(true), round(true)], { attempts: 2, firstRight: 0, firstTotal: 2 })]);
  const skipped = lesson("b", 1, [game(at(1, 21), [round(false, { skipped: true })], { kind: "speak" })]);
  const r = pilotReport(student(), [replay, skipped], [], START, 1, NOW);
  assert.deepEqual(r.weeks[0].firstGo, { right: 0, total: 0 });
  assert.equal(r.weeks[0].replays, 1);
  assert.equal(r.weeks[0].activeDays, 1);
});

test("retention is Smart Review games; repeated mistakes are on skills with mistakes before", () => {
  const review = lesson("r", 2, [game(at(2, 18), [round(true), round(true), round(false)])], { review: { by: "schedule", skillIds: [], reason: "", minutes: 5 } });
  const skills = [
    { topic: "past", status: "improving", note: "", firstSeen: at(-20), lastSeen: at(0), lessonIds: [], mistakes: [{ at: at(-10), lessonId: "x", asked: "q", answered: "goed" }, { at: at(2), lessonId: "r", asked: "q", answered: "eated" }] },
    { topic: "plural", status: "improving", note: "", firstSeen: at(-20), lastSeen: at(0), lessonIds: [], mistakes: [{ at: at(3), lessonId: "r", asked: "q", answered: "mouses" }] },
  ];
  const r = pilotReport(student(skills), [review], [], START, 1, NOW);
  assert.deepEqual(r.weeks[0].retention, { right: 2, total: 3 });
  assert.equal(r.weeks[0].mistakes, 2);
  assert.equal(r.weeks[0].repeated, 1);
  assert.equal(r.weeks[0].approvals, 1);
});

test("cost: everything for this child, and the part practice added", () => {
  const usage = [
    { at: at(1), purpose: "smart_review", costUsd: 0.002, ok: true, studentId: "s" },
    { at: at(1), purpose: "lesson_homework", costUsd: 0.003, ok: true, studentId: "s" },
    { at: at(1), purpose: "regeneration", costUsd: 0.001, ok: true, studentId: "s" },
    { at: at(1), purpose: "smart_review", costUsd: 0.5, ok: true, studentId: "other" },
  ];
  const r = pilotReport(student(), [], usage, START, 1, NOW);
  assert.ok(Math.abs(r.weeks[0].costUsd - 0.006) < 1e-9);
  assert.ok(Math.abs(r.weeks[0].practiceCostUsd - 0.003) < 1e-9);
  assert.equal(r.weeks[0].rebuilds, 1);
});

test("the months whose usage log a pilot reads", () => {
  assert.deepEqual(pilotMonths("2026-11-23", 3), ["2026-11", "2026-12"]);
});
