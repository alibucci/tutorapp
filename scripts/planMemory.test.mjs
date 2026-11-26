/**
 * What the lesson planner is told about the children's practice: one child, a
 * group, nobody with a record, mistakes that keep coming back - in words,
 * never as a percentage, and never with a name. Run with `npm test`.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import * as rules from "../src/lib/memory.ts";
import { childMemory, cleanReview, describeMemory } from "../src/lib/planMemory.ts";

const NOW = "2026-11-27T10:00:00.000Z";
const day = (n) => new Date(Date.parse(NOW) + n * 86_400_000).toISOString();

const skill = (topic, over = {}) => ({
  topic,
  status: "improving",
  note: "",
  firstSeen: day(-40),
  lastSeen: day(-10),
  lessonIds: ["l1"],
  ...over,
});
const result = (right, total, at, source = "homework", lessonId = `h-${at}`) => ({ at, source, lessonId, right, total });
const mistake = (answered, correct, lessonId, at = day(-5)) => ({ at, lessonId, asked: "Yesterday I ___ to the park.", answered, correct });

/** A child who mixes up the past tense, is coming along with colours and knows numbers. */
const pastTense = skill("Irregular past tense", {
  status: "struggling",
  area: "grammar",
  evidence: [result(1, 4, day(-9)), result(2, 4, day(-3), "review")],
  mistakes: [mistake("goed", "went", "h1", day(-9)), mistake("seed", "saw", "h1", day(-9)), mistake("goed", "went", "h2", day(-3))],
  reviewAt: day(-1),
});
const colours = skill("Colours", { evidence: [result(3, 3, day(-6))], reviewAt: day(-2) });
const numbers = skill("Numbers 1-10", { status: "solid", reviewAt: day(20), evidence: [result(4, 4, day(-4))] });

const memory = (skills, hide = []) => childMemory(skills, { now: NOW, hide }, rules);

test("one child: weak points with results in words and the right forms, then due, then solid", () => {
  const text = describeMemory([memory([pastTense, colours, numbers])]);
  assert.match(text, /^What this child's practice shows/);
  assert.match(text, /a sign, not proof/);
  assert.match(text, /Weak points - review briefly:\n- Irregular past tense \(still learning\)/);
  assert.match(text, /1 of 4 right first time \(homework, 18 Nov\); 2 of 4 right first time \(Smart Review, 24 Nov\)/);
  // The answer that keeps coming back leads, with the form to teach.
  assert.match(text, /keeps answering "goed" instead of "went", "seed" instead of "saw"/);
  assert.match(text, /Coming along[^\n]*\n- Colours \(due for review\): 3 of 3 right first time/);
  assert.match(text, /Solid - do not teach again: Numbers 1-10/);
  assert.ok(text.indexOf("Weak points") < text.indexOf("Coming along"));
  assert.ok(text.indexOf("Coming along") < text.indexOf("Solid"));
});

test("coming along: shown when due or practised lately, with its results; quiet otherwise", () => {
  const lately = skill("Can for ability", { evidence: [result(2, 4, day(-1))], reviewAt: day(1) });
  const quiet = skill("This is my", { reviewAt: day(3) });
  const m = memory([lately, quiet]);
  assert.deepEqual(m.along.map((p) => p.topic), ["Can for ability"]);
  assert.match(describeMemory([m]), /- Can for ability \(not due yet\): 2 of 4 right first time \(homework, 26 Nov\)/);
});

test("nothing percentage-like, ever", () => {
  const text = describeMemory([memory([pastTense, colours, numbers]), memory([pastTense, numbers])]);
  assert.doesNotMatch(text, /%|percent|\b0\.\d|score|accuracy/i);
});

test("no skills, or nothing assessed: nothing to say, so the prompt stays as it was", () => {
  assert.equal(describeMemory([memory([])]), "");
  assert.equal(describeMemory([undefined]), "");
  assert.equal(describeMemory([memory([skill("Animals", { lessonIds: [] })])]), "");
  assert.equal(describeMemory([memory([]), memory([])]), "");
  assert.deepEqual(memory([]), { weak: [], along: [], solid: [] });
});

test("a mistake that came up in one homework only is not a recurring one", () => {
  const once = skill("Plurals", { status: "struggling", mistakes: [mistake("mouses", "mice", "h1"), mistake("foots", "feet", "h1")] });
  const text = describeMemory([memory([once])]);
  assert.match(text, /- Plurals \(still learning\)$/m);
  assert.doesNotMatch(text, /keeps answering/);
});

test("recurring mistakes: the same wrong answer most often first, capped, only with a right form", () => {
  const many = skill("Past tense", {
    status: "struggling",
    mistakes: [
      mistake("eated", "ate", "h1"),
      mistake("goed", "went", "h1"),
      mistake("goed", "went", "h2"),
      mistake("x", "", "h2"),
      mistake("Went", "went", "h3"),
      mistake("buyed", "bought", "h3"),
    ],
  });
  const [point] = memory([many]).weak;
  assert.deepEqual(point.mistakes, ['"goed" instead of "went"', '"buyed" instead of "bought"']);
});

test("old results say nothing about the next lesson and are left out", () => {
  const old = skill("Weather", { status: "struggling", evidence: [result(0, 4, day(-60))] });
  assert.deepEqual(memory([old]).weak[0].results, []);
});

test("lists are capped: the prompt stays short", () => {
  const lots = Array.from({ length: 12 }, (_, i) => skill(`Weak thing ${i}`, { status: "struggling", lastSeen: day(-i) }));
  const solid = Array.from({ length: 12 }, (_, i) => skill(`Known thing ${i}`, { status: "solid", reviewAt: day(30) }));
  const m = memory([...lots, ...solid]);
  assert.equal(m.weak.length, 4);
  assert.equal(m.solid.length, 6);
  assert.ok(describeMemory([m]).split("\n").length <= 8);
});

test("no names: a line that mentions a child is dropped, and the programme track is left out", () => {
  const named = skill("Talking about Anna's family", { status: "struggling" });
  const story = skill("Bible story: Noah", { status: "struggling", area: "curriculum" });
  const answer = skill("Possessives", {
    status: "struggling",
    mistakes: [mistake("Viktor book", "Viktor's book", "h1"), mistake("Viktor book", "Viktor's book", "h2"), mistake("hers", "her", "h2")],
  });
  const text = describeMemory([memory([named, story, answer], ["Anna Lee", "Viktor"])]);
  assert.doesNotMatch(text, /Anna|Viktor|Bible|Noah/);
  assert.match(text, /Possessives/);
  assert.match(text, /"hers" instead of "her"/);
});

test("a group: shared weak points first, a need of one child marked as such", () => {
  const a = memory([pastTense, skill("Plurals", { status: "struggling", lastSeen: day(-1) }), numbers]);
  const b = memory([skill("Irregular past tense: went, saw", { status: "struggling", evidence: [result(1, 3, day(-2))] }), numbers]);
  const c = memory([skill("Irregular past tense", { status: "struggling" }), numbers, colours]);
  const text = describeMemory([a, b, c]);
  assert.match(text, /^What the children's practice shows \(3 children/);
  const lines = text.split("\n");
  const weakAt = lines.indexOf("Weak points - review briefly, shared ones first:");
  assert.ok(weakAt > 0, text);
  // "Irregular past tense" and "Irregular past tense: went, saw" are one skill (skillKey).
  assert.match(lines[weakAt + 1], /^- Irregular past tense \(every child\)/);
  assert.match(lines[weakAt + 1], /2 of 4 right first time \(Smart Review, 24 Nov\); 1 of 3 right first time/);
  assert.match(lines[weakAt + 1], /"goed" instead of "went"/);
  assert.match(lines[weakAt + 2], /^- Plurals \(one child only - keep it light, do not single them out\)/);
  // Colours is due for one child only.
  assert.match(text, /- Colours \(one child only[^)]*\)/);
  assert.match(text, /Solid for every child - do not teach again: Numbers 1-10/);
});

test("a group: solid for some but weak for another is not 'do not teach'", () => {
  const a = memory([numbers]);
  const b = memory([skill("Numbers 1-10", { status: "struggling" })]);
  const text = describeMemory([a, b]);
  assert.match(text, /- Numbers 1-10 \(one child only/);
  assert.doesNotMatch(text, /Solid for every child/);
});

test("a group where one child has no record yet says so", () => {
  const text = describeMemory([memory([pastTense]), memory([])]);
  assert.match(text, /No practice record yet for one child\./);
  assert.match(text, /- Irregular past tense \(one child only/);
  // Solid for one child of two is not solid for the group.
  assert.equal(describeMemory([memory([numbers]), memory([])]), "");
});

test("review lines: short, no repeats, and what the tutor took out stays out", () => {
  const out = cleanReview(
    [
      "Warm-up: past tense - went, saw, ate (came back in homework)",
      "warm-up: past tense - went, saw, ate (came back in homework).",
      "  Speaking: colours in the model sentence  ",
      "Activity: plurals",
      "Wrap-up: numbers",
    ],
    ["Activity: plurals"],
  );
  assert.deepEqual(out, [
    "Warm-up: past tense - went, saw, ate (came back in homework)",
    "Speaking: colours in the model sentence",
    "Wrap-up: numbers",
  ]);
  assert.deepEqual(cleanReview([]), []);
  assert.ok(cleanReview(["x".repeat(300)])[0].length <= 140);
});
