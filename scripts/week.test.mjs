/**
 * The learner's week on the child's and the parent's screens, on a fixed
 * clock. Run with `npm test`.
 */
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";

// week.ts imports its import-free neighbours as "./homework" - the way the
// app's bundler reads them. Node needs the extension, so add it here rather
// than write ".ts" into the app's imports.
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

const {
  activityKind,
  answeredThisWeek,
  completedAt,
  currentQuest,
  doneThisWeek,
  learningFocus,
  nextPractice,
  openQuests,
  parentWeek,
  plannedPractice,
  studentWeek,
  weekBounds,
  whenShort,
} = await import("../src/lib/week.ts");

// Friday 27 Nov 2026, 10:00 in Shanghai (UTC+8) = 02:00 UTC.
const FRI_10 = Date.UTC(2026, 10, 27, 2, 0);
const TZ = "Asia/Shanghai";

const game = (kind, finishedAt, over = {}) => ({ kind, topic: "Past tense", right: 3, total: 4, finishedAt, ...over });
const ex = (kind) => ({ kind, topic: "Past tense", rounds: [] });
let n = 0;
const lesson = ({ games = ["choose"], results = [], sentAt = "2026-11-24T02:00:00Z", review, createdAt = sentAt } = {}) => ({
  id: `l${++n}`,
  title: review ? "Smart Review · 24 Nov" : "Animals at the zoo",
  createdAt,
  ...(review && { kind: "practice", review: { reason: "", skillIds: [], minutes: 10, by: "schedule", ...review } }),
  homework: { focus: "", sentAt, exercises: games.map(ex), results },
});

test("the week runs Monday to Sunday in the learner's own time zone", () => {
  const w = weekBounds(FRI_10, TZ);
  // Monday 23 Nov 00:00 in Shanghai is Sunday 22 Nov 16:00 UTC.
  assert.equal(new Date(w.start).toISOString(), "2026-11-22T16:00:00.000Z");
  assert.equal(new Date(w.end).toISOString(), "2026-11-29T16:00:00.000Z");
  // Sunday evening is still the same week; Monday just after midnight is the next.
  assert.equal(weekBounds(Date.UTC(2026, 10, 29, 15, 59), TZ).start, w.start);
  assert.equal(weekBounds(Date.UTC(2026, 10, 29, 16, 0), TZ).start, w.end);
  // The same instant is a different week in London (still Sunday there).
  const sunInLondon = Date.UTC(2026, 10, 29, 20, 0);
  assert.equal(new Date(weekBounds(sunInLondon, "Europe/London").start).toISOString(), "2026-11-23T00:00:00.000Z");
  // Across a month boundary.
  assert.equal(new Date(weekBounds(Date.UTC(2026, 11, 2, 4, 0), TZ).start).toISOString(), "2026-11-29T16:00:00.000Z");
});

test("only homework finished this week counts as done this week", () => {
  const w = weekBounds(FRI_10, TZ);
  const thisWeek = lesson({ results: [game("choose", "2026-11-25T09:00:00Z")] });
  const lastWeek = lesson({ results: [game("choose", "2026-11-20T09:00:00Z")], sentAt: "2026-11-19T02:00:00Z" });
  const halfDone = lesson({ games: ["choose", "match"], results: [game("choose", "2026-11-26T09:00:00Z")] });
  const notSent = { ...lesson({ results: [game("choose", "2026-11-25T09:00:00Z")] }), homework: { focus: "", exercises: [ex("choose")], results: [game("choose", "2026-11-25T09:00:00Z")] } };
  assert.deepEqual(doneThisWeek([thisWeek, lastWeek, halfDone, notSent], w).map((l) => l.id), [thisWeek.id]);
});

test("a replay this week does not make last week's homework this week's", () => {
  const w = weekBounds(FRI_10, TZ);
  const replayedOnly = lesson({ results: [game("choose", "2026-11-26T09:00:00Z", { attempts: 2 }), game("match", "2026-11-20T09:00:00Z")], games: ["choose", "match"] });
  assert.equal(completedAt(replayedOnly.homework), "2026-11-20T09:00:00Z");
  assert.equal(doneThisWeek([replayedOnly], w).length, 0);
  // A picture's written answers count as finishing too.
  const picture = { ...lesson({ games: [] }), homework: { focus: "", sentAt: "2026-11-24T02:00:00Z", imageFile: "a.png", answers: { describe: "", next: "", adjectives: ["a", "b", "c"], submittedAt: "2026-11-26T10:00:00Z" } } };
  assert.equal(completedAt(picture.homework), "2026-11-26T10:00:00Z");
});

test("unplayed homework is never counted as wrong answers", () => {
  const w = weekBounds(FRI_10, TZ);
  const unplayed = lesson({ games: ["choose", "match"] });
  assert.deepEqual(answeredThisWeek([unplayed], w), { right: 0, total: 0 });
  // Skipped rounds are neither right nor wrong; a replay is not counted again.
  const played = lesson({
    games: ["choose", "match", "speak"],
    results: [
      game("choose", "2026-11-25T09:00:00Z", { right: 3, total: 4, firstRight: 2, firstTotal: 4 }),
      game("match", "2026-11-25T09:05:00Z", { attempts: 2 }),
      game("speak", "2026-11-25T09:10:00Z", { right: 0, total: 0, rounds: [{ asked: "q", answered: "(nothing heard)", right: false, skipped: true }] }),
    ],
  });
  assert.deepEqual(answeredThisWeek([played, unplayed], w), { right: 2, total: 4 });
});

test("the quest to do now: one already started, then the newest; set-aside reviews never", () => {
  const older = lesson({ sentAt: "2026-11-23T02:00:00Z" });
  const newer = lesson({ sentAt: "2026-11-26T02:00:00Z" });
  const begun = lesson({ games: ["choose", "match"], results: [game("choose", "2026-11-25T09:00:00Z")], sentAt: "2026-11-22T02:00:00Z" });
  const archived = lesson({ review: { state: "archived" }, sentAt: "2026-11-27T01:00:00Z" });
  const done = lesson({ results: [game("choose", "2026-11-25T09:00:00Z")], sentAt: "2026-11-27T01:30:00Z" });
  assert.equal(currentQuest([older, newer, archived, done])?.id, newer.id);
  assert.equal(currentQuest([older, newer, begun])?.id, begun.id);
  assert.equal(currentQuest([archived, done]), null);
  assert.deepEqual(openQuests([archived, older, newer]).map((l) => l.id), [newer.id, older.id, archived.id]);
});

test("Smart Review and lesson homework are told apart", () => {
  const w = weekBounds(FRI_10, TZ);
  const review = lesson({ review: {}, results: [game("choose", "2026-11-25T09:00:00Z")] });
  const homework = lesson({ results: [game("choose", "2026-11-26T09:00:00Z")] });
  assert.equal(activityKind(review), "review");
  assert.equal(activityKind(homework), "lesson");
  const week = parentWeek({ skills: [] }, [review, homework], FRI_10);
  assert.deepEqual(week.doneBy, { lesson: 1, review: 1, story: 0, extra: 0 });
  // A Bible story and the tutor's extra homework are neither of the two.
  assert.equal(activityKind({ kind: "practice", module: { id: "christianity" } }), "story");
  assert.equal(activityKind({ kind: "practice", request: "more verbs" }), "extra");
  assert.equal(week.label, "23 Nov - 29 Nov");
  assert.equal(doneThisWeek([review, homework], w)[0].id, homework.id);
});

const schedule = {
  enabled: true,
  reviewDays: [3, 5], // Wednesday, Friday
  time: "17:00",
  timezone: TZ,
  minutes: 10,
  maxPerWeek: 2,
  mode: "auto",
  updatedAt: "2026-11-01T00:00:00Z",
};

test("the next practice is the next slot the queue would really fill", () => {
  const next = nextPractice(schedule, [], FRI_10);
  assert.equal(new Date(next.at).toISOString(), "2026-11-27T09:00:00.000Z");
  assert.equal(whenShort(next, FRI_10, TZ), "today at 17:00");
  // Waiting for the tutor to check it: the day is firm, the time is not.
  assert.equal(whenShort(nextPractice({ ...schedule, mode: "approval" }, [], FRI_10), FRI_10, TZ), "today");
  // Manual, paused or off: nothing is planned.
  assert.equal(nextPractice({ ...schedule, mode: "manual" }, [], FRI_10), null);
  assert.equal(nextPractice({ ...schedule, pausedAt: "x" }, [], FRI_10), null);
  assert.equal(nextPractice(undefined, [], FRI_10), null);
  // An open review holds the next one back: nothing is promised.
  const open = lesson({ review: {}, createdAt: "2026-11-25T09:00:00Z" });
  assert.equal(nextPractice(schedule, [open], FRI_10), null);
  // Two already this week: Friday is skipped, so the next is Wednesday.
  const made = (at) => lesson({ review: {}, createdAt: at, results: [game("choose", at)] });
  const full = nextPractice(schedule, [made("2026-11-25T09:00:00Z"), made("2026-11-23T09:00:00Z")], FRI_10);
  assert.equal(whenShort(full, FRI_10, TZ), "on Wed at 17:00");
});

test("the child's week: done count, the quest now, the rest folded, and the next practice", () => {
  const doneOne = lesson({ results: [game("choose", "2026-11-25T09:00:00Z")] });
  const a = lesson({ sentAt: "2026-11-26T02:00:00Z" });
  const b = lesson({ sentAt: "2026-11-25T02:00:00Z" });
  const week = studentWeek({ schedule }, [doneOne, a, b], FRI_10);
  assert.equal(week.doneCount, 1);
  assert.equal(week.current.id, a.id);
  assert.deepEqual(week.others.map((l) => l.id), [b.id]);
  assert.equal(week.next, "today at 17:00");
  const empty = studentWeek({}, [doneOne], FRI_10);
  assert.equal(empty.current, null);
  assert.equal(empty.next, null);
});

test("the plan and the learning focus, in plain words", () => {
  assert.equal(plannedPractice(schedule), "Wed and Fri, about 10 minutes each");
  assert.equal(plannedPractice({ ...schedule, reviewDays: [0, 1] }), "Mon and Sun, about 10 minutes each");
  assert.equal(plannedPractice({ ...schedule, enabled: false }), null);
  const skill = (topic, status, over = {}) => ({ topic, status, note: "", firstSeen: "2026-11-01", lastSeen: "2026-11-20", lessonIds: ["x"], ...over });
  const focus = learningFocus(
    [
      skill("Past tense", "struggling"),
      skill("Animals", "improving"),
      skill("Colours", "solid", { reviewAt: "2026-12-20T00:00:00Z" }),
      skill("Numbers", "solid", { reviewAt: "2026-11-20T00:00:00Z" }), // due back
      { ...skill("New thing", "improving"), lessonIds: [] }, // nothing recorded yet
    ],
    FRI_10,
  );
  assert.deepEqual(focus.practice.map((s) => s.topic), ["Past tense", "Numbers"]);
  assert.deepEqual(focus.coming.map((s) => s.topic), ["Animals"]);
  assert.deepEqual(focus.solid.map((s) => s.topic), ["Colours"]);
});
