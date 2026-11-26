/**
 * The learning programme every generator reads, and what of its plan a lesson
 * reached - the two things homework is built on besides the lesson itself.
 * Run with `npm test`.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanLearning, describePreferences, preferenceLines } from "../src/lib/profile.ts";
import { contextOf, describeLessonContext, slidesOnCovered, sortPoints, wordPoint } from "../src/lib/coverage.ts";

// ------------------------------------------------------------ preferences

test("nothing set says nothing: the prompt stays as it always was", () => {
  assert.equal(describePreferences(undefined), "");
  assert.equal(describePreferences({}), "");
  assert.equal(describePreferences({ age: 9, learning: {} }), "");
  // The defaults are not news to the model.
  assert.equal(describePreferences({ learning: { difficulty: "level", approval: true } }), "");
  assert.equal(describePreferences({ parentWish: "   " }), "");
});

test("every field set reads as one short block, avoid marked as a hard limit", () => {
  const text = describePreferences({
    parentWish: "wants more speaking",
    learning: {
      objectives: "Conversational English, vocabulary, grammar and sentence building",
      curriculum: "Bible stories",
      include: "animals",
      avoid: "Halloween",
      requirements: "Homework uses only what was covered in lessons",
      difficulty: "stretch",
      approval: true,
    },
  });
  const lines = text.split("\n");
  assert.equal(lines[0], "The learning programme the family and tutor chose:");
  assert.ok(text.includes("- Objectives: Conversational English"));
  assert.ok(text.includes("- Curriculum focus: Bible stories"));
  assert.ok(text.includes("- Topics to include: animals"));
  assert.ok(text.includes("- Topics to AVOID (a hard limit): Halloween"));
  assert.ok(text.includes("- Content requirements: Homework uses only"));
  assert.ok(text.includes("- Difficulty: one step above their level"));
  assert.ok(text.includes("- The parents asked for: wants more speaking"));
  // Whether the tutor approves practice is not the model's business.
  assert.ok(!/approv/i.test(text));
  assert.equal(lines.length, 8);
});

test("the parent's wish alone is a programme too", () => {
  assert.equal(
    describePreferences({ parentWish: "more reading" }),
    "The learning programme the family and tutor chose:\n- The parents asked for: more reading",
  );
});

test("the game theme is not part of the programme", () => {
  assert.equal(describePreferences({ look: "game", about: "loves Minecraft" }), "");
});

test("preferenceLines has no heading, for a group to put together", () => {
  assert.deepEqual(preferenceLines({ learning: { difficulty: "easier", avoid: "spiders" } }), [
    "- Topics to AVOID (a hard limit): spiders",
    "- Difficulty: one step easier than their level - never more than one step",
  ]);
});

test("cleanLearning stores nothing for an untouched form", () => {
  assert.equal(cleanLearning(undefined), undefined);
  assert.equal(
    cleanLearning({ objectives: " ", curriculum: "", difficulty: "level", approval: false }),
    undefined,
  );
});

test("cleanLearning trims, keeps what was set and cuts at the limits", () => {
  assert.deepEqual(cleanLearning({ curriculum: "  Bible   stories ", difficulty: "easier", approval: true }), {
    curriculum: "Bible stories",
    difficulty: "easier",
    approval: true,
  });
  assert.equal(cleanLearning({ curriculum: "x".repeat(500) }).curriculum.length, 200);
  // Anything else that came in is not stored.
  assert.deepEqual(cleanLearning({ avoid: "war", difficulty: "hardest", other: 1 }), { avoid: "war" });
});

// ------------------------------------------------------------ what the lesson reached

const card = {
  goal: "talk about animals, use can",
  words: ["cat", "dog", "fish"],
  materials: {
    slides: [
      { title: "Hello!", text: "How are you today?" },
      { title: "Cat", text: "A cat can jump.", say: "cat" },
      { title: "Cat and dog", text: "The cat and the dog play." },
      { title: "Fish", text: "A fish can swim.", say: "fish" },
      { title: "Category game", text: "Sort the pictures." },
    ],
  },
};
const points = ["talk about animals, use can", wordPoint("cat"), wordPoint("dog"), wordPoint("fish")];

test("statuses sort into covered, partly, not reached and unsure", () => {
  const check = {
    done: [wordPoint("cat")],
    partial: ["talk about animals, use can"],
    missed: [wordPoint("dog")],
    unclear: [wordPoint("fish")],
  };
  assert.deepEqual(sortPoints(points, check), {
    covered: ['the word "cat"'],
    partly: ["talk about animals, use can"],
    notReached: ['the word "dog"'],
    unsure: ['the word "fish"'],
  });
});

test("no check at all: every point needs confirmation, none is guessed", () => {
  const sorted = sortPoints(points, undefined);
  assert.deepEqual(sorted.unsure, points);
  assert.deepEqual([...sorted.covered, ...sorted.partly, ...sorted.notReached], []);
});

test("an older check without unclear keeps its missed points as not reached", () => {
  const sorted = sortPoints(points, { done: points.slice(0, 2), partial: [], missed: points.slice(2) });
  assert.deepEqual(sorted.notReached, [wordPoint("dog"), wordPoint("fish")]);
  assert.deepEqual(sorted.unsure, []);
});

test("a point added to the card after the check needs confirmation", () => {
  const sorted = sortPoints([...points, wordPoint("bird")], { done: points, partial: [], missed: [] });
  assert.deepEqual(sorted.unsure, [wordPoint("bird")]);
});

test("slides only on words reached, never one that brings in a word not reached", () => {
  const lines = slidesOnCovered(card.materials.slides, ["cat"], ["dog"]);
  // "Cat and dog" teaches dog too; "Category" is not the word cat.
  assert.deepEqual(lines, ["Cat: A cat can jump."]);
  assert.deepEqual(slidesOnCovered(card.materials.slides, [], []), []);
});

test("the context puts it together, and the prompt block says what not to use", () => {
  const check = { done: [wordPoint("cat"), wordPoint("fish")], partial: [], missed: [wordPoint("dog")], unclear: [points[0]], at: "" };
  const ctx = contextOf(points, check, card);
  assert.deepEqual(ctx.words, ["cat", "dog", "fish"]);
  assert.equal(ctx.goal, "talk about animals, use can");
  assert.deepEqual(ctx.slides, ["Cat: A cat can jump.", "Fish: A fish can swim."]);
  assert.equal(ctx.group, undefined);

  const block = describeLessonContext(ctx);
  assert.ok(block.includes('Covered in the lesson: the word "cat"; the word "fish"'));
  assert.ok(block.includes('Planned but NOT reached - do not use: the word "dog"'));
  assert.ok(block.includes("Needs confirmation (no evidence either way"));
  assert.ok(block.includes("shown is not the same as learnt"));
  assert.ok(!block.includes("Partly covered"));
  assert.ok(!block.includes("group lesson"));
});

test("a group's child is told the check is the group's and their summary is theirs", () => {
  const ctx = contextOf(points, undefined, { words: [], goal: " " }, true);
  assert.equal(ctx.goal, undefined);
  assert.deepEqual(ctx.slides, []);
  assert.ok(describeLessonContext(ctx).includes("This was a group lesson"));
});
