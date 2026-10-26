import { z } from "zod";
import { MODEL, complete } from "./llm";
import { listLessons } from "./store";
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
  why: z.string().min(3).max(200),
});

const Build = z.object({
  answer: z
    .array(z.string().min(1).max(24))
    .min(3)
    .max(8)
    .describe("The sentence, one word per entry, in the right order"),
  why: z
    .string()
    .min(3)
    .max(200)
    .describe(
      "Why the words go in THIS order - the shape of the sentence, not the tense",
    ),
});

const Catch = z.object({
  word: z.string().min(1).max(24),
  keep: z.boolean(),
});

const ExercisesSchema = z.object({
  topic: z
    .string()
    .min(3)
    .max(160)
    .describe(
      "For the tutor, not the child: the one mistake all three games practise, under 60 characters. Grammar words are fine here.",
    ),
  chooseTitle: z.string().min(3).max(120),
  choose: z.array(Choose).min(4).max(6),
  buildTitle: z.string().min(3).max(120),
  build: z.array(Build).min(3).max(4),
  catchTitle: z.string().min(3).max(120),
  catchRule: z
    .string()
    .min(5)
    .max(160)
    .describe(
      'An instruction to the child with no grammar words, e.g. "Catch the things Iron Man already did" - a whole short sentence',
    ),
  catchWords: z.array(Catch).min(6).max(10),
});

const SYSTEM = `You build three small practice games for one child, from the
mistakes they made in today's English lesson. The child plays them alone, at
home, with no adult to explain anything - so every word on the screen has to
make sense to them on its own.

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
   The mistake this game catches is WORD ORDER, so "why" must be about order:
   "Who did it, then what, then where: I had pizza for dinner." Writing about
   the form of the word here explains a mistake the child did not make.
3. CATCH. Single words drifting past. The child keeps the ones that follow one
   simple idea and waves the rest away. Mix roughly half and half, and make the
   wrong ones tempting - the forms this child confuses.

THE CHILD NEVER SEES A GRAMMAR WORD. Not in a title, a rule, a sentence or a
"why": no "tense", "past simple", "present", "verb", "noun", "plural",
"adjective", "article", "-ed form", "irregular". A child who understands
go/went has no idea what "the past tense" is, and the word stops them cold.
Say the idea in a child's own words instead:
- not "Choose the past tense" but "What did Iron Man do yesterday?"
- not "Keep the past tense words" but "Catch the things that already happened"
- not "Use the past tense" but "Yesterday is over, so: went."
Titles are short and fun - a question or a bit of the story - never a lesson
heading.

ONE ADVENTURE, NEVER THE SAME ROUND TWICE. This child gets bored fast when
rounds repeat and loves exploring something new. So:
- Tell one small adventure across all three games, with a hero the child likes
  (use their interests below; a made-up explorer if there are none). Every
  round is the next step of that story - a new place, a new discovery, a new
  problem - so the child wants to see what happens next.
- Practise the one idea through MANY different words, not one word over and
  over. If the mistake is "go" for "went", the rounds use went, saw, ate, had,
  swam, found, ran - the same idea each time, a different word each time. No
  answer word is right in more than one CHOOSE round.
- In CATCH every word appears once. Never the same word twice.
- Never repeat a sentence or a scene within a game, and do not reuse CHOOSE
  sentences in BUILD. Vary the people, places and actions from round to round.
- Fewer, fresher rounds beat more of the same.

Rules for everything you write:
- Real, ordinary English a child would say. No invented words, no exam English.
- Vocabulary from the lesson where you have it, so the words are familiar.
- Every sentence must be unambiguously right or wrong. If two options could
  both be correct in some context, rewrite it. This is the one thing that
  matters most: a child who is marked wrong for a right answer loses trust.
- "why" is one short line to the child, after they answer, in their words:
  what makes it right, not whether they are clever. "Yesterday is over, so:
  went."
- Heroes from films, games and books the child likes are welcome by name. No
  real people. Use the child's own name at most once.
- British or American spelling, consistently, matching the lesson.`;

/**
 * What the child is into, from the note the tutor recorded about them, so the
 * games can star a hero they actually like.
 */
async function interestsOf(student: Student): Promise<string> {
  const lessons = await listLessons(student.id);
  return lessons
    .filter((l) => l.kind === "intro")
    .flatMap((l) => l.debrief.filter((a) => a.promptId === "likes").map((a) => a.text.trim()))
    .filter(Boolean)
    .join(" ");
}

/** Everything the model needs about this lesson, and nothing else. */
function describeLesson(lesson: Lesson, student: Student, interests: string): string {
  const s = lesson.summary;
  const weak = student.skills
    .filter((k) => k.status !== "solid")
    .map((k) => `- ${k.topic}: ${k.note}`)
    .join("\n");

  return [
    `Child: ${student.name}`,
    interests ? `What they are into: ${interests}` : "What they are into: not recorded",
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

/**
 * The model tends to put the right answer first. Shuffled once here, when the
 * homework is made, and stored that way - the server marks against the stored
 * order, so the browser and the server always agree.
 */
function shuffleOptions(r: z.infer<typeof Choose>): z.infer<typeof Choose> {
  const order = r.options.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return { ...r, options: order.map((i) => r.options[i]), answer: order.indexOf(r.answer) };
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
    user: describeLesson(lesson, student, await interestsOf(student)),
    schema: ExercisesSchema,
    schemaName: "PracticeGames",
    maxTokens: 8000,
    effort: "low",
    outputLanguage: "English",
  });

  // Trim rather than reject: a label a few characters over is a worse reason
  // to lose a whole set of games than a label that reads a little short.
  const short = (text: string, limit = 60) =>
    text.trim().length <= limit ? text.trim() : `${text.trim().slice(0, limit - 1)}…`;
  const topic = short(parsed.topic);

  // A "why" a little long is a worse reason to lose every game than a line
  // that ends early; the prompt asks for one short line anyway.
  const choose = parsed.choose
    .filter(usableChoose)
    .map((r) => shuffleOptions({ ...r, why: short(r.why, 120) }));
  parsed.build = parsed.build.map((r) => ({ ...r, why: short(r.why, 120) }));
  // Half of each is worth playing; less than that is not a game.
  // A word twice in a row is the repetition children notice first.
  const seenWord = new Set<string>();
  parsed.catchWords = parsed.catchWords.filter((w) => {
    const k = w.word.trim().toLowerCase();
    if (seenWord.has(k)) return false;
    seenWord.add(k);
    return true;
  });
  const keeps = parsed.catchWords.filter((w) => w.keep).length;
  const drops = parsed.catchWords.length - keeps;

  const exercises: Exercise[] = [];
  if (choose.length >= 3) {
    exercises.push({
      kind: "choose",
      title: short(parsed.chooseTitle, 50),
      topic,
      rounds: choose,
    });
  }
  if (parsed.build.length >= 2) {
    exercises.push({
      kind: "build",
      title: short(parsed.buildTitle, 50),
      topic,
      rounds: parsed.build,
    });
  }
  if (keeps >= 2 && drops >= 2) {
    exercises.push({
      kind: "catch",
      title: short(parsed.catchTitle, 50),
      topic,
      rule: short(parsed.catchRule, 70),
      rounds: parsed.catchWords,
    });
  }
  return exercises;
}

export { MODEL as EXERCISE_MODEL };
