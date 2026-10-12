import { z } from "zod";
import { MODEL, complete } from "./llm";
import type { Exercise, Lesson, Student } from "./types";

/**
 * Practice games built from one lesson's mistakes.
 *
 * The shape is fixed - three mechanics the child already knows how to play -
 * and only the words inside change. That is the whole point: a child meets the
 * same three games every week, so no lesson is spent explaining the game, and
 * what they practise is exactly what they got wrong on Tuesday.
 */

const Choose = z.object({
  sentence: z
    .string()
    .min(8)
    .max(120)
    .describe('One sentence with exactly one gap written as "___"'),
  options: z.array(z.string().min(1).max(24)).length(3),
  answer: z.number().int().min(0).max(2),
  why: z.string().min(3).max(90),
});

const Build = z.object({
  answer: z
    .array(z.string().min(1).max(24))
    .min(3)
    .max(8)
    .describe("The sentence, one word per entry, in the right order"),
  why: z.string().min(3).max(90),
});

const Catch = z.object({
  word: z.string().min(1).max(24),
  keep: z.boolean(),
});

const ExercisesSchema = z.object({
  topic: z
    .string()
    .min(3)
    .max(60)
    .describe("The one mistake all three games practise, in plain words"),
  chooseTitle: z.string().min(3).max(50),
  choose: z.array(Choose).min(4).max(6),
  buildTitle: z.string().min(3).max(50),
  build: z.array(Build).min(3).max(4),
  catchTitle: z.string().min(3).max(50),
  catchRule: z
    .string()
    .min(5)
    .max(60)
    .describe(
      'An instruction to the child, e.g. "Keep the past tense words" - a whole short sentence',
    ),
  catchWords: z.array(Catch).min(6).max(10),
});

const SYSTEM = `You build three small practice games for one child, from the
mistakes they made in today's English lesson.

Pick ONE mistake - the one that cost them most - and build all three games
around it. Three games on one mistake beats three games on three mistakes: the
child is here to fix that one thing.

The three games, always these:

1. CHOOSE. A sentence with one gap and three words under it. One is right. The
   two wrong ones must be the mistakes this child actually makes, not random
   words - if they say "I eat yesterday", the wrong options are "eat" and
   "eating", not "banana".
2. BUILD. Short sentences the child puts back in order, word by word. Each one
   uses the thing being practised. Three to eight words, no longer: a child
   taps these on a phone.
3. CATCH. Single words drifting past. The child keeps the ones that follow one
   simple rule and waves the rest away. Write the rule as one short
   instruction a nine-year-old can read at a glance: "Keep the past tense
   words." Mix roughly half and half, and make the wrong ones tempting - the
   forms this child confuses.

Rules for everything you write:
- Real, ordinary English a child would say. No invented words, no exam English.
- Vocabulary from the lesson where you have it, so the words are familiar.
- Every sentence must be unambiguously right or wrong. If two options could
  both be correct in some context, rewrite it. This is the one thing that
  matters most: a child who is marked wrong for a right answer loses trust.
- "why" is one short line to the child, after they answer: what the rule is,
  not whether they are clever. "We add -ed for things that already happened."
- No names of real people. Use the child's own name at most once.
- British or American spelling, consistently, matching the lesson.`;

/** Everything the model needs about this lesson, and nothing else. */
function describeLesson(lesson: Lesson, student: Student): string {
  const s = lesson.summary;
  const weak = student.skills
    .filter((k) => k.status !== "solid")
    .map((k) => `- ${k.topic}: ${k.note}`)
    .join("\n");

  return [
    `Child: ${student.name}`,
    `Lesson: ${lesson.title}`,
    "",
    "What they got wrong today:",
    s?.struggles.map((x) => `- ${x.what} (heard: "${x.evidence}")`).join("\n") ||
      "- nothing specific recorded",
    "",
    "Corrections the tutor made:",
    s?.teachingSignals.map((x) => `- ${x.concept}: "${x.correction}"`).join("\n") ||
      "- none recorded",
    "",
    `Topics covered: ${s?.covered.join(", ") || "general English"}`,
    s?.homeworkFocus ? `The tutor wants them to practise: ${s.homeworkFocus}` : "",
    weak ? `\nStill weak from earlier lessons:\n${weak}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/** A round is only usable if its three options really are three options. */
function usableChoose(r: z.infer<typeof Choose>): boolean {
  const seen = new Set(r.options.map((o) => o.trim().toLowerCase()));
  return r.sentence.includes("___") && seen.size === 3;
}

export async function buildExercises(
  lesson: Lesson,
  student: Student,
): Promise<Exercise[]> {
  const parsed = await complete({
    system: SYSTEM,
    user: describeLesson(lesson, student),
    schema: ExercisesSchema,
    schemaName: "PracticeGames",
    maxTokens: 8000,
    effort: "low",
    outputLanguage: "English",
  });

  const choose = parsed.choose.filter(usableChoose);
  // Half of each is worth playing; less than that is not a game.
  const keeps = parsed.catchWords.filter((w) => w.keep).length;
  const drops = parsed.catchWords.length - keeps;

  const exercises: Exercise[] = [];
  if (choose.length >= 3) {
    exercises.push({
      kind: "choose",
      title: parsed.chooseTitle,
      topic: parsed.topic,
      rounds: choose,
    });
  }
  if (parsed.build.length >= 2) {
    exercises.push({
      kind: "build",
      title: parsed.buildTitle,
      topic: parsed.topic,
      rounds: parsed.build,
    });
  }
  if (keeps >= 2 && drops >= 2) {
    exercises.push({
      kind: "catch",
      title: parsed.catchTitle,
      topic: parsed.topic,
      rule: parsed.catchRule,
      rounds: parsed.catchWords,
    });
  }
  return exercises;
}

export { MODEL as EXERCISE_MODEL };
