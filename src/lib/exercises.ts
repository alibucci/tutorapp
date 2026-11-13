import { z } from "zod";
import { MODEL, MODEL_FAST, complete } from "./llm";
import { describeLearner, formatsFor, isChild } from "./profile";
import { listLessons } from "./store";
import { type NumbersPlan, numbersHomework } from "./sums";
import { EXERCISE_KINDS, type Exercise, type ExerciseKind, type Lesson, type Student } from "./types";

/**
 * Practice built from one lesson's mistakes.
 *
 * Which kinds of task, and how many rounds, follow from the learner's profile
 * (profile.ts): a child at school gets the three games they already know, every
 * week, so no lesson is spent explaining a game; someone working on their
 * accent gets things to listen to and say. Only the words inside change, and
 * they come from what this learner got wrong.
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

const Repeat = z.object({
  sentence: z.string().min(3).max(140).describe("A sentence to hear and say back"),
  tip: z
    .string()
    .min(3)
    .max(160)
    .describe("One short line on saying it well: the sound, stress or linking to watch"),
});

const Dialogue = z.object({
  them: z.string().min(1).max(160).describe("What the other person says"),
  you: z.string().min(2).max(160).describe("The learner's reply, to say out loud"),
});

const Speak = z.object({
  question: z.string().min(5).max(160),
  example: z.string().min(3).max(220).describe("What a good answer could sound like"),
});

const Words = z.object({
  meaning: z.string().min(5).max(160).describe("What the word means, or a sentence with it missing"),
  options: z.array(z.string().min(1).max(30)).length(3),
  answer: z.number().int().min(0).max(2),
  why: z.string().min(3).max(200),
});

/** How many rounds each kind gets: the usual, and the short version. */
const ROUNDS: Record<ExerciseKind, { usual: [number, number]; short: [number, number] }> = {
  choose: { usual: [4, 6], short: [3, 3] },
  build: { usual: [3, 4], short: [2, 2] },
  catch: { usual: [6, 10], short: [4, 6] },
  repeat: { usual: [5, 6], short: [3, 4] },
  dialogue: { usual: [4, 6], short: [3, 3] },
  speak: { usual: [3, 4], short: [2, 2] },
  words: { usual: [5, 6], short: [3, 4] },
};

/** The JSON asked of the model: only the kinds this learner gets. */
function schemaFor(formats: ExerciseKind[], short: boolean) {
  const n = (kind: ExerciseKind) => ROUNDS[kind][short ? "short" : "usual"];
  const list = <T extends z.ZodType>(item: T, kind: ExerciseKind) =>
    z.array(item).min(n(kind)[0]).max(n(kind)[1]);
  const title = z.string().min(3).max(120);
  const fields: Record<string, z.ZodType> = {
    topic: z
      .string()
      .min(3)
      .max(160)
      .describe(
        "For the tutor, not the learner: the one thing every task practises, under 60 characters. Grammar words are fine here.",
      ),
  };
  for (const kind of formats) {
    if (kind === "choose") Object.assign(fields, { chooseTitle: title, choose: list(Choose, kind) });
    if (kind === "build") Object.assign(fields, { buildTitle: title, build: list(Build, kind) });
    if (kind === "catch") {
      Object.assign(fields, {
        catchTitle: title,
        catchRule: z
          .string()
          .min(5)
          .max(160)
          .describe(
            'An instruction with no grammar words, e.g. "Catch the things Iron Man already did" - a whole short sentence',
          ),
        catchWords: list(Catch, kind),
      });
    }
    if (kind === "repeat") Object.assign(fields, { repeatTitle: title, repeat: list(Repeat, kind) });
    if (kind === "dialogue") {
      Object.assign(fields, {
        dialogueTitle: title,
        dialogueSetting: z
          .string()
          .min(5)
          .max(160)
          .describe("Where this happens and who the other person is, in one line"),
        dialogue: list(Dialogue, kind),
      });
    }
    if (kind === "speak") Object.assign(fields, { speakTitle: title, speak: list(Speak, kind) });
    if (kind === "words") Object.assign(fields, { wordsTitle: title, words: list(Words, kind) });
  }
  return z.object(fields);
}

type Parsed = {
  topic: string;
  chooseTitle?: string;
  choose?: z.infer<typeof Choose>[];
  buildTitle?: string;
  build?: z.infer<typeof Build>[];
  catchTitle?: string;
  catchRule?: string;
  catchWords?: z.infer<typeof Catch>[];
  repeatTitle?: string;
  repeat?: z.infer<typeof Repeat>[];
  dialogueTitle?: string;
  dialogueSetting?: string;
  dialogue?: z.infer<typeof Dialogue>[];
  speakTitle?: string;
  speak?: z.infer<typeof Speak>[];
  wordsTitle?: string;
  words?: z.infer<typeof Words>[];
};

/**
 * The prompt for the case the app started with, a child at school getting the
 * three games, word for word as it was. It works; the others are built around
 * it rather than replacing it.
 */
const KID_SCHOOL = `You build three small practice games for one child, from the
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
const FORMAT: Record<ExerciseKind, string> = {
  choose: `CHOOSE. A sentence with one gap and three words under it. One is right. The
   two wrong ones must be the mistakes this learner actually makes, not random
   words - if they say "I eat yesterday", the wrong options are "eat" and
   "eating", not "banana".`,
  build: `BUILD. Short sentences the learner puts back in order, word by word. Each
   one uses the thing being practised. Three to eight words, no longer: they tap
   these on a phone. "why" is about ORDER: "Who did it, then what, then where."`,
  catch: `CATCH. Single words drifting past. The learner keeps the ones that follow
   one simple idea and waves the rest away. Mix roughly half and half, and make
   the wrong ones tempting - the forms this learner confuses.`,
  repeat: `LISTEN AND REPEAT. Sentences the learner hears read aloud, then says back.
   Natural sentences they would really say, built around the thing being
   practised. "tip" is one short line on saying it well - the sound, the stress or
   the linking that trips this learner up: 'Link it: "a-cup-of", not "a. cup. of."'
   Under eight words at beginner level.`,
  dialogue: `ROLE-PLAY. A short conversation in a real situation from the learner's
   life. Each round the other person says something ("them") and the learner
   answers ("you"), reading their line out loud - so "you" is exactly what a
   fluent speaker would say there, using the thing being practised. The rounds
   follow on from each other as one conversation.`,
  speak: `ANSWER OUT LOUD. Questions the learner answers in their own words. Each one
   invites the thing being practised - a question about yesterday invites the
   past. "example" is a short, good answer they compare theirs with afterwards.`,
  words: `TOPIC WORDS. Words from the learner's world and today's lesson. "meaning"
   says what the word means in simple English, or is a sentence with the word
   missing as "___". Three options, one right; the two wrong ones are real words
   from the same topic that are easy to mix up.`,
};

const CHILD_RULES = `THE CHILD NEVER SEES A GRAMMAR WORD. Not in a title, a rule, a sentence or a
"why": no "tense", "past simple", "present", "verb", "noun", "plural",
"adjective", "article", "-ed form", "irregular". Say the idea in a child's own
words instead: not "Choose the past tense" but "What did Iron Man do
yesterday?" Titles are short and fun - a question or a bit of the story.

ONE ADVENTURE, NEVER THE SAME ROUND TWICE. Tell one small adventure across all
the tasks, with a hero the child likes (from their interests; a made-up
explorer if there are none). Practise the one idea through many different
words, never one word over and over. Never repeat a sentence anywhere.

Rules for everything you write:
- Real, ordinary English a child would say. No invented words, no exam English.
- Vocabulary from the lesson where you have it, so the words are familiar.
- Every round with a right answer must be unambiguously right or wrong. A child
  marked wrong for a right answer loses trust.
- "why", "tip" and "example" are one short line in the child's own words.
- Heroes from films, games and books the child likes are welcome by name. No
  real people. Use the child's own name at most once.
- Ignore anything about health or diagnoses in the tutor's notes.
- British or American spelling, consistently, matching the lesson.`;

const GROWN_RULES = `WRITE FOR A CAPABLE PERSON. Plain, friendly and direct, like a good tutor's
handout. No games talk: no quests, heroes, points, levels or "Great job!".
Titles say what the task is: "Taking an order", "Linking words in requests".

THEIR WORLD, NOT A TEXTBOOK'S. Set every task in the learner's own life, from
what the tutor wrote about them: someone who runs a restaurant practises with
orders, menus, staff, suppliers and guests. Practise the one idea through many
different sentences; never repeat one.

Rules for everything you write:
- Real, current English people actually use. No exam English, no invented words.
- Vocabulary from the lesson where you have it.
- Match their level: short, common words at beginner level; natural, idiomatic
  English at advanced.
- Every round with a right answer must be unambiguously right or wrong.
- A grammar word is fine where it helps ("past tense"), in one short line.
- No real people other than the learner, and their name at most once.
- Keep everything suitable for their age.
- Ignore anything about health or diagnoses in the tutor's notes.
- British or American spelling, consistently, matching the lesson.`;

/** The prompt for any learner and any mix of tasks. */
function systemFor(formats: ExerciseKind[], child: boolean): string {
  const n = formats.length === 2 ? "two" : formats.length === 3 ? "three" : String(formats.length);
  const intro = child
    ? `You build ${n} small practice tasks for one child, from the mistakes they made
in today's English lesson. The child does them alone, at home, with no adult to
explain anything - so every word on the screen has to make sense on its own.

Pick ONE mistake - the one that cost them most - and build every task around it.`
    : `You build ${n} short homework tasks for one learner who is not a young child, from
today's English lesson. They do them alone, on their phone.

Pick ONE thing - the mistake that cost them most, or what the tutor wants
practised - and build every task around it.`;
  const tasks = formats.map((kind, i) => `${i + 1}. ${FORMAT[kind]}`).join("\n");
  return `${intro}\n\nThe tasks, in this order:\n\n${tasks}\n\n${child ? CHILD_RULES : GROWN_RULES}`;
}

/**
 * Extra homework: not from a lesson's mistakes but from what the tutor typed -
 * "adding and taking away up to 20", "animals for Friday's trip". Sometimes
 * not English at all; the task shapes carry it anyway.
 */
function systemForPractice(formats: ExerciseKind[], child: boolean): string {
  const n = formats.length === 2 ? "two" : formats.length === 3 ? "three" : String(formats.length);
  const intro = `You build ${n} short homework tasks for one ${child ? "child" : "learner"},
practising exactly what their tutor asked for (below) - nothing else. They do
them alone, at home, on a phone${child ? ", with no adult to explain anything" : ""}.

Where the request is not about English - sums, say - the tasks practise that,
in simple English, using the same task shapes:
- a CHOOSE round writes the sum in digits with the gap last - "7 + 5 = ___",
  three numbers as options. A few words of story before it are welcome
  ("Zippy finds more berries: 6 + 4 = ___"), but the sum itself is always
  written out in digits, never only as a word problem;
- CATCH "words" can be short sums written in full, like "9 + 4 = 13", kept
  when they are true and waved away when they are not;
- stay inside the limits the tutor gave ("up to 20" means no number above 20
  anywhere, answers included). Every sum must be right: check each one.`;
  const tasks = formats.map((kind, i) => `${i + 1}. ${FORMAT[kind]}`).join("\n");
  return `${intro}\n\nThe tasks, in this order:\n\n${tasks}\n\n${child ? CHILD_RULES : GROWN_RULES}`;
}

const RequestPlan = z.object({
  kinds: z
    .array(z.enum(EXERCISE_KINDS as unknown as [ExerciseKind, ...ExerciseKind[]]))
    .min(2)
    .max(3)
    .describe("The task kinds that fit the request best, most useful first"),
  numbers: z.object({
    only: z
      .boolean()
      .describe(
        "True when the request is only about numbers: sums (adding, taking away, times tables, dividing) and/or counting. False for word problems, money, time, shapes, or anything with words to learn.",
      ),
    add: z.boolean(),
    subtract: z.boolean(),
    multiply: z.boolean(),
    divide: z.boolean(),
    upTo: z
      .number()
      .int()
      .min(5)
      .max(1000)
      .describe(
        'For sums: the largest number allowed in a sum, answers included: "up to 20" is 20. For times tables up to 10 x 10, 100. With no limit given, pick one that fits the learner.',
      ),
    tables: z
      .array(z.number().int().min(1).max(12))
      .max(12)
      .describe('For times or dividing: which tables, e.g. [3] for "the 3 times table". Empty for any.'),
    counting: z
      .boolean()
      .describe('Counting is asked for: "count to 50", "numbers in order", "counting in 5s".'),
    countTo: z.number().int().min(10).max(1000).describe("How far to count: 50 for \"count to 50\". 20 when not asked."),
    countBy: z
      .array(z.number().int().min(1).max(100))
      .max(4)
      .describe("Counting in ones [1], or in 2s, 5s, 10s as asked. Empty for ones."),
    topic: z.string().max(60).describe('What is practised, plainly: "Adding and taking away up to 20"'),
    chooseTitle: z.string().max(50).describe("A short, fun title for working out answers, in the learner's world"),
    buildTitle: z.string().max(50).describe("A short, fun title for putting numbers in counting order"),
    catchTitle: z.string().max(50).describe("A short, fun title for catching the sums that are right"),
  }),
});

const KIND_HINT: Record<ExerciseKind, string> = {
  choose: "choose: fill one gap from three options",
  build: "build: put a short sentence's words in order",
  catch: "catch: keep the items that follow a rule, drop the rest",
  words: "words: pick the word that matches a meaning",
  repeat: "repeat: hear a sentence and say it back (pronunciation)",
  dialogue: "dialogue: a role-play, saying the learner's lines aloud",
  speak: "speak: answer a question aloud in their own words",
};

type Plan = { kinds: ExerciseKind[]; numbers: (NumbersPlan & z.infer<typeof RequestPlan>["numbers"]) | null };

/**
 * Read what the tutor asked for: plain sums, which code makes, or anything
 * else, with the shapes of task that suit it.
 */
async function planRequest(request: string, student: Student, short: boolean): Promise<Plan> {
  try {
    const plan = await complete({
      system: `A tutor asks for extra homework for one learner. Read the request.

If it is only about numbers - sums, counting, or both - fill in "numbers" (only: true). The questions themselves are made by code, so just say which operations, how big the numbers, and how far to count.

Either way, pick two or three kinds of task that practise it best. Speaking kinds (repeat, dialogue, speak) only when the request is about speaking or pronunciation.

The kinds:
${EXERCISE_KINDS.map((k) => `- ${KIND_HINT[k]}`).join("\n")}`,
      user: `${describeLearner(student.name, student.profile)}\n\nThe tutor asks for: ${request}`,
      schema: RequestPlan,
      schemaName: "Plan",
      model: MODEL_FAST,
      effort: "low",
      maxTokens: 2000,
      timeoutMs: 40_000,
    });
    const kinds = [...new Set(plan.kinds)];
    const n = plan.numbers;
    const numbers = n.only && (n.add || n.subtract || n.multiply || n.divide || n.counting) ? n : null;
    return { kinds: short ? kinds.slice(0, 2) : kinds, numbers };
  } catch {
    // The learner's usual kinds are a fair answer to most requests.
    const usual = formatsFor(student.profile);
    return { kinds: short ? usual.slice(0, 2) : usual, numbers: null };
  }
}

/** What the model needs for extra homework: the learner and the request. */
function describeRequest(lesson: Lesson, student: Student, interests: string): string {
  return [
    describeLearner(student.name, student.profile),
    interests ? `What they are into: ${interests}` : "What they are into: not recorded",
    "",
    `What the tutor wants practised: ${lesson.request ?? lesson.title}`,
  ].join("\n");
}

/**
 * Sums are checked here, not trusted to the model: a child marked wrong for
 * a right answer stops trusting the game. "7 + 5 = ___" gets the right
 * answer marked, or is dropped if it is not among the options; "9 + 4 = 13"
 * in a catch game is kept exactly when it is true.
 */
const SUM = /(\d{1,4})\s*([+\-−–])\s*(\d{1,4})\s*=\s*/;
function sumOf(text: string, anywhere = false): number | null {
  const m = text.match(anywhere ? SUM : new RegExp(`^\\s*${SUM.source}`));
  if (!m) return null;
  const a = Number(m[1]);
  const b = Number(m[3]);
  return m[2] === "+" ? a + b : a - b;
}

function checkSumChoice(r: z.infer<typeof Choose>): z.infer<typeof Choose> | null {
  const numbers = r.options.every((o) => /^\s*-?\d+\s*$/.test(o));
  const sum = r.sentence.match(new RegExp(`${SUM.source}___`));
  if (!sum) {
    // Numbers to pick from but no sum we can check: a word problem the
    // model may have got wrong. Not worth the risk.
    return numbers ? null : r;
  }
  const total = sumOf(sum[0], true);
  const at = r.options.findIndex((o) => o.trim() !== "" && Number(o.trim()) === total);
  return at < 0 ? null : { ...r, answer: at };
}

function checkSumCatch(w: z.infer<typeof Catch>): z.infer<typeof Catch> {
  const total = sumOf(w.word);
  const said = w.word.match(/=\s*(-?\d{1,5})\s*$/);
  if (total === null || !said) return w;
  return { ...w, keep: Number(said[1]) === total };
}

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
    describeLearner(student.name, student.profile),
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

/** A round to pick a word in is only usable if its three options really are three. */
function threeOptions(options: string[]): boolean {
  return new Set(options.map((o) => o.trim().toLowerCase())).size === 3;
}

export async function buildExercises(
  lesson: Lesson,
  student: Student,
): Promise<Exercise[]> {
  const practice = lesson.kind === "practice";
  const short = Boolean(student.profile?.shortTasks);
  const child = isChild(student.profile);
  const plan = practice ? await planRequest(lesson.request ?? lesson.title, student, short) : null;
  // Sums and counting: made by code, right by construction. No model writes them.
  if (plan?.numbers) {
    const made = numbersHomework(plan.numbers, plan.numbers, short);
    if (made.length) return made;
  }
  const formats = plan ? plan.kinds : formatsFor(student.profile);
  const usual = !practice && child && !short && formats.join() === "choose,build,catch";
  const interests = await interestsOf(student);

  const parsed = (await complete({
    system: practice ? systemForPractice(formats, child) : usual ? KID_SCHOOL : systemFor(formats, child),
    user: practice ? describeRequest(lesson, student, interests) : describeLesson(lesson, student, interests),
    schema: schemaFor(formats, short),
    schemaName: "Homework",
    maxTokens: 8000,
    effort: "low",
    // Usually half a minute. When DeepSeek is busy the careful model has
    // taken over two; the fast one builds games about as good in a third of
    // the time.
    timeoutMs: 60_000,
    fallbackModel: MODEL_FAST,
    outputLanguage: "English",
  })) as Parsed;

  // Trim rather than reject: a label a few characters over is a worse reason
  // to lose a whole set of games than a label that reads a little short.
  const cut = (text: string, limit = 60) =>
    text.trim().length <= limit ? text.trim() : `${text.trim().slice(0, limit - 1)}…`;
  const topic = cut(parsed.topic);
  const title = (text: string | undefined) => cut(text ?? "", 50);
  // Fewer than this and it is not worth opening.
  const least = short ? 2 : 3;

  const made: Partial<Record<ExerciseKind, Exercise>> = {};

  // A "why" a little long is a worse reason to lose every game than a line
  // that ends early; the prompt asks for one short line anyway.
  const choose = (parsed.choose ?? [])
    .filter(usableChoose)
    .map(checkSumChoice)
    .filter((r): r is z.infer<typeof Choose> => r !== null)
    .map((r) => shuffleOptions({ ...r, why: cut(r.why, 120) }));
  if (choose.length >= least) {
    made.choose = { kind: "choose", title: title(parsed.chooseTitle), topic, rounds: choose };
  }

  const build = (parsed.build ?? []).map((r) => ({ ...r, why: cut(r.why, 120) }));
  if (build.length >= 2) {
    made.build = { kind: "build", title: title(parsed.buildTitle), topic, rounds: build };
  }

  // A word twice in a row is the repetition children notice first.
  const seenWord = new Set<string>();
  const catchWords = (parsed.catchWords ?? []).map(checkSumCatch).filter((w) => {
    const k = w.word.trim().toLowerCase();
    if (seenWord.has(k)) return false;
    seenWord.add(k);
    return true;
  });
  const keeps = catchWords.filter((w) => w.keep).length;
  // Half of each is worth playing; less than that is not a game.
  if (keeps >= 2 && catchWords.length - keeps >= 2) {
    made.catch = {
      kind: "catch",
      title: title(parsed.catchTitle),
      topic,
      rule: cut(parsed.catchRule ?? "", 70),
      rounds: catchWords,
    };
  }

  const repeat = (parsed.repeat ?? []).map((r) => ({ sentence: r.sentence.trim(), tip: cut(r.tip, 140) }));
  if (repeat.length >= 2) {
    made.repeat = { kind: "repeat", title: title(parsed.repeatTitle), topic, rounds: repeat };
  }

  const dialogue = (parsed.dialogue ?? []).map((r) => ({ them: r.them.trim(), you: r.you.trim() }));
  if (dialogue.length >= 2) {
    made.dialogue = {
      kind: "dialogue",
      title: title(parsed.dialogueTitle),
      topic,
      setting: cut(parsed.dialogueSetting ?? "", 140),
      rounds: dialogue,
    };
  }

  const speak = (parsed.speak ?? []).map((r) => ({ question: r.question.trim(), example: cut(r.example, 200) }));
  if (speak.length >= 2) {
    made.speak = { kind: "speak", title: title(parsed.speakTitle), topic, rounds: speak };
  }

  const words = (parsed.words ?? [])
    .filter((r) => threeOptions(r.options))
    .map((r) => {
      const shuffled = shuffleOptions({ sentence: "___", ...r });
      return { meaning: r.meaning, options: shuffled.options, answer: shuffled.answer, why: cut(r.why, 120) };
    });
  if (words.length >= 2) {
    made.words = { kind: "words", title: title(parsed.wordsTitle), topic, rounds: words };
  }

  return formats.map((kind) => made[kind]).filter((e): e is Exercise => Boolean(e));
}

export { MODEL as EXERCISE_MODEL };
