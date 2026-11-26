/**
 * The learner's memory: matching skills, recording evidence, spaced review,
 * merging duplicates. Run with `npm run test:memory`.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  REVIEW_DAYS,
  dueSkills,
  findSkill,
  memoryState,
  mergeSkills,
  newSkillId,
  recordGame,
  recordLesson,
  recordPractice,
  skillKey,
  withIds,
} from "../src/lib/memory.ts";

const T0 = "2026-11-01T10:00:00.000Z";
const day = (n) => new Date(new Date(T0).getTime() + n * 86_400_000).toISOString();
const skill = (over = {}) => ({
  topic: "Irregular past tense verbs",
  status: "improving",
  note: "went, saw, had",
  firstSeen: T0,
  lastSeen: T0,
  lessonIds: ["l1"],
  ...over,
});
const practice = (right, total, over = {}) => ({ at: day(1), lessonId: "h1", source: "homework", right, total, mistakes: [], ...over });

test("the same skill written two ways has one key", () => {
  assert.equal(skillKey("Past tense: went, saw, had, slept"), skillKey("past tense"));
  assert.equal(skillKey("Using the past tense (went, saw)"), "past tense");
  assert.notEqual(skillKey("Plural nouns"), skillKey("Past tense"));
});

test("ids are stable: reading an old record twice gives the same id", () => {
  const [a] = withIds([skill()]);
  const [b] = withIds([skill()]);
  assert.equal(a.id, b.id);
  assert.equal(a.id, newSkillId("Irregular past tense verbs", T0));
  const [kept] = withIds([{ ...skill(), id: "x-1" }]);
  assert.equal(kept.id, "x-1");
});

test("a skill is found by id, name, old name or meaning", () => {
  const skills = withIds([skill({ aliases: ["Past tense: went, saw"] }), skill({ topic: "Plural nouns", firstSeen: day(2) })]);
  assert.equal(findSkill(skills, skills[1].id).topic, "Plural nouns");
  assert.equal(findSkill(skills, "Past tense: went, saw").topic, "Irregular past tense verbs");
  assert.equal(findSkill(skills, "plural nouns!").topic, "Plural nouns");
  assert.equal(findSkill(skills, "Telling the time"), undefined);
});

test("states: never a made-up percentage, the tutor's status leads", () => {
  assert.equal(memoryState(skill({ lessonIds: [] })), "not_assessed");
  assert.equal(memoryState(skill({ status: "struggling" })), "learning");
  assert.equal(memoryState(skill({ status: "improving" })), "improving");
  assert.equal(memoryState(skill({ status: "solid" }), day(1)), "retained");
  assert.equal(memoryState(skill({ status: "solid", reviewAt: day(3) }), day(5)), "needs_review");
});

test("one game is not proof: fewer than two marked rounds leave the schedule alone", () => {
  const s = recordPractice(skill({ step: 2, reviewAt: day(7) }), practice(0, 1));
  assert.equal(s.step, 2);
  assert.equal(s.reviewAt, day(7));
  assert.equal(s.lastPracticed, day(1));
});

test("doing well pushes the next review out; doing badly brings it back", () => {
  const good = recordPractice(skill({ step: 1 }), practice(5, 5));
  assert.equal(good.step, 2);
  assert.equal(good.reviewAt, new Date(new Date(day(1)).getTime() + REVIEW_DAYS[2] * 86_400_000).toISOString());
  const bad = recordPractice(skill({ step: 3 }), practice(1, 5));
  assert.equal(bad.step, 0);
  const middling = recordPractice(skill({ step: 3 }), practice(3, 5));
  assert.equal(middling.step, 3);
});

test("a solid skill that keeps slipping in homework needs review", () => {
  let s = skill({ status: "solid", reviewAt: day(30) });
  s = recordPractice(s, practice(0, 4, { lessonId: "h1" }));
  s = recordPractice(s, practice(1, 4, { lessonId: "h2", at: day(2) }));
  assert.equal(memoryState(s, day(3)), "needs_review");
});

test("the same homework recorded twice is one piece of evidence", () => {
  let s = recordPractice(skill(), practice(2, 4, { mistakes: [{ asked: "I ___ home", answered: "goed" }] }));
  s = recordPractice(s, practice(3, 4, { mistakes: [{ asked: "I ___ home", answered: "goed" }] }));
  assert.equal(s.evidence.filter((e) => e.lessonId === "h1").length, 1);
  assert.equal(s.mistakes.length, 1);
});

test("a lesson's status is evidence and sets the first review", () => {
  const s = recordLesson(skill({ status: "struggling" }), "l2", "struggling", T0, "mixes went/goed");
  assert.equal(s.evidence.at(-1).status, "struggling");
  assert.equal(s.reviewAt, day(REVIEW_DAYS[0]));
});

test("merging duplicates loses nothing", () => {
  const a = { ...skill({ topic: "Past tense: went, saw", lastSeen: day(1), lessonIds: ["l1"] }), id: "a" };
  const b = {
    ...skill({ topic: "Irregular past tense verbs", status: "solid", lastSeen: day(5), lessonIds: ["l2"], reviewAt: day(9) }),
    id: "b",
    mistakes: [{ at: day(4), lessonId: "h9", asked: "q", answered: "x" }],
  };
  const c = { ...skill({ topic: "Plural nouns" }), id: "c" };
  const out = mergeSkills([a, b, c], "b", ["a"], { parent: "Past Simple", area: "grammar" });
  assert.equal(out.length, 2);
  const m = out.find((s) => s.id === "b");
  assert.deepEqual(m.lessonIds.sort(), ["l1", "l2"]);
  assert.ok(m.aliases.includes("Past tense: went, saw"));
  assert.equal(m.status, "solid");
  assert.equal(m.parent, "Past Simple");
  assert.equal(m.mistakes.length, 1);
  assert.ok(findSkill(out, "Past tense: went, saw"));
});

test("a game counts toward the skills it names, or the one its topic is", () => {
  const skills = withIds([skill(), skill({ topic: "Plural nouns", firstSeen: day(2) })]);
  const byId = recordGame(skills, [skills[1].id], "anything", practice(2, 2));
  assert.equal(byId[1].lastPracticed, day(1));
  assert.equal(byId[0].lastPracticed, undefined);
  const byTopic = recordGame(skills, undefined, "irregular past tense verbs", practice(2, 2));
  assert.equal(byTopic[0].lastPracticed, day(1));
  assert.equal(recordGame(skills, undefined, "Telling the time", practice(2, 2)), skills);
});

test("due skills, longest overdue first", () => {
  const skills = withIds([skill({ reviewAt: day(4) }), skill({ topic: "B", reviewAt: day(2), firstSeen: day(1) }), skill({ topic: "C", reviewAt: day(20), firstSeen: day(2) })]);
  assert.deepEqual(dueSkills(skills, day(5)).map((s) => s.topic), ["B", "Irregular past tense verbs"]);
});
