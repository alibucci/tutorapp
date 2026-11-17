import { z } from "zod";
import { GENESIS, NEVER_ANYWHERE, PASS_SHARE, type StoryCard, type StoryQuestion } from "@/content/christianity/genesis";
import { MODEL_FAST, complete } from "./llm";
import { getTutor, updateStudent } from "./store";
import type { Session } from "./auth";
import type { GameStyle } from "./gameStyles";
import type {
  Exercise,
  Homework,
  KindRound,
  Lesson,
  ModuleState,
  ParentMessage,
  QuestionRound,
  ReadPage,
  Student,
} from "./types";

/**
 * The Christianity homework: Bible stories for a young child starting from
 * nothing, one at a time, in order, each with one simple rule for living.
 *
 * The system keeps the learner's place and picks the next story; the tutor
 * builds it, checks it, and sends it like any homework. The story is retold by
 * the model from a card (src/content/christianity), and code checks the
 * retelling against the card before anyone sees it.
 */

export const PROGRAMME = GENESIS;

// ---------------------------------------------------------------------------
// Who may use it
// ---------------------------------------------------------------------------

/**
 * Release is gated by tutor until Victor has checked the rules for religious
 * content for children. CHRISTIANITY_TUTORS holds tutor emails or ids,
 * comma-separated, or "*" for everyone. Unset: the superadmin only. Even where
 * open, it is off for every learner until the tutor switches it on with the
 * parent's request ticked.
 */
export async function christianityOpenTo(session: Session | null | undefined): Promise<boolean> {
  if (!session) return false;
  if (session.role === "admin") return true;
  const list = (process.env.CHRISTIANITY_TUTORS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (list.includes("*")) return true;
  if (list.includes(session.id.toLowerCase())) return true;
  const tutor = await getTutor(session.id);
  return Boolean(tutor && list.includes(tutor.email.toLowerCase()));
}

export function moduleOf(student: Pick<Student, "modules">): ModuleState | undefined {
  return student.modules?.christianity;
}

export function moduleOn(student: Pick<Student, "modules">): boolean {
  return Boolean(moduleOf(student)?.enabled);
}

export function cardById(id: string | undefined): StoryCard | undefined {
  return PROGRAMME.find((c) => c.id === id);
}

/**
 * Switch on or off. On needs the parent's request ticked; the time is the
 * server's. Off keeps the place and the passed stories.
 */
export async function setModule(
  student: Student,
  on: boolean,
  parentAsked: boolean,
): Promise<{ student?: Student; error?: string }> {
  const current = moduleOf(student);
  if (on && !parentAsked) {
    return { error: "Tick “The parent asked for this” to switch it on." };
  }
  const next: ModuleState = on
    ? {
        position: current?.position ?? 0,
        passed: current?.passed ?? [],
        ...(current?.review && { review: current.review }),
        enabled: true,
        parentAskedAt: new Date().toISOString(),
      }
    : current
      ? { ...current, enabled: false }
      : { enabled: false, parentAskedAt: "", position: 0, passed: [] };
  const saved = await updateStudent(student.id, (s) => ({
    modules: { ...s.modules, christianity: next },
  }));
  return saved ? { student: saved } : { error: "No such student." };
}

/** What the next homework will be, or that the programme is over. */
export function nextStory(
  state: ModuleState | undefined,
): { card: StoryCard; review?: StoryCard } | null {
  const position = state?.position ?? 0;
  const card = PROGRAMME.find((c) => c.order === position);
  if (!card) return null;
  const review = cardById(state?.review);
  return { card, ...(review && review.id !== card.id && { review }) };
}

// ---------------------------------------------------------------------------
// Checks by code
// ---------------------------------------------------------------------------

function escape(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** A word or phrase at the start of a word: "dark" finds "darkness". */
function has(text: string, word: string): boolean {
  const pattern = escape(word.toLowerCase()).replace(/\s+/g, "\\s+");
  return new RegExp(`(^|[^a-z])${pattern}`, "i").test(text);
}

/**
 * A whole word, with the usual endings allowed: "kill" finds "killed",
 * "die" finds "died", "pray" finds "prayed" and "praying". Still whole-word,
 * so "sin" does not find "sing" or "since", "die" not "diet", "saint" not
 * "faint".
 */
function hasWord(text: string, word: string): boolean {
  const pattern = escape(word.toLowerCase()).replace(/\s+/g, "\\s+");
  return new RegExp(`(^|[^a-z])${pattern}(s|es|ed|d|ing)?([^a-z]|$)`, "i").test(text);
}

/** The text's sentences, as written. */
function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])["”]?\s+/)
    .map((x) => x.trim())
    .filter((x) => /[a-z]/i.test(x));
}

/** A sentence for comparing: lower case, no punctuation or extra spaces. */
function plain(sentence: string): string {
  return sentence.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
}

export function wordCount(paragraphs: string[]): number {
  return paragraphs.join(" ").split(/\s+/).filter((w) => /[a-z0-9]/i.test(w)).length;
}

/** The facts a recap has to hold: the story's own, without its opening line. */
function recapFacts(card: StoryCard) {
  return card.facts.filter((f) => !f.frame);
}

/** Facts missing from the text, by what they say. A recap skips the opening line. */
export function missingFacts(text: string, card: StoryCard, recap = false): string[] {
  return (recap ? recapFacts(card) : card.facts)
    .filter((f) => !f.check.every((entry) => (Array.isArray(entry) ? entry.some((e) => has(text, e)) : has(text, entry))))
    .map((f) => f.say);
}

/** Words from either "never" list that turned up. */
export function forbiddenIn(text: string, card?: StoryCard): string[] {
  const words = [...NEVER_ANYWHERE, ...(card?.never.words ?? [])];
  return [...new Set(words.filter((w) => hasWord(text, w)))];
}

/** Questions whose answer the text does not hold. */
export function unanswerable(text: string, questions: StoryQuestion[]): string[] {
  return questions.filter((q) => !q.find.every((w) => has(text, w))).map((q) => q.question);
}

const STORY_WORDS = { min: 80, max: 120 };
const RECAP_WORDS = { min: 30, max: 70 };

// ---------------------------------------------------------------------------
// The retelling
// ---------------------------------------------------------------------------

const Retelling = z.object({
  paragraphs: z
    .array(z.string().min(10).max(500))
    .min(2)
    .max(5)
    .describe("The story, in short paragraphs. 80 to 120 words in all."),
  newWords: z
    .array(z.string().min(1).max(24))
    .max(2)
    .describe("Words in the story a beginner of this age is meeting for the first time: two at most"),
  recap: z
    .array(z.string().min(10).max(400))
    .max(3)
    .describe("Only when asked for: a short recap of the earlier story, 30 to 70 words. Otherwise empty."),
  kindness: z
    .array(
      z.object({
        situation: z.string().min(10).max(220),
        options: z.array(z.string().min(2).max(90)).length(3),
        best: z.number().int().min(0).max(2),
        why: z.string().min(5).max(160),
      }),
    )
    .length(2)
    .describe('Two "What would you do?" situations about today\'s rule'),
  sayIt: z
    .string()
    .min(5)
    .max(80)
    .describe("One short sentence copied exactly from the story, for the child to repeat aloud"),
});

type Retold = z.infer<typeof Retelling>;

const SYSTEM = `You retell one Bible story for a young child who is learning English and
knows nothing about the Bible yet. The child reads it on a phone and listens to
it read aloud, then answers questions about it.

THE STORY CARD BELOW IS THE WHOLE STORY. Tell exactly the facts on the card,
in that order, and nothing else: no extra events, no extra people or animals,
no other meaning and no moral of your own. Every fact must be in your text in
plain words - the words on the card, or as close to them as English allows.

How it is told:
- The very first sentence is exactly: "This is a story from the Bible."
  Nothing comes before it. Christians' beliefs are said as theirs ("Christians
  believe..."). The story itself is then told from inside, simply: "God said:
  Let there be light!"
- English for a beginner (A1): short sentences, the most common words. At most
  two words the child is meeting for the first time, and only words that are
  in the story ("Bible" is never one of them).
- Warm and calm. A gentle question is welcome after the first sentence ("Can
  you close your eyes? What can you see?").
- Never repeat a sentence: every sentence is said once.
- Today's rule is not in the story. It is only in the "What would you do?"
  situations.
- 80 to 120 words in all, in two to four short paragraphs.
- Nothing about punishment, fear, hell or sin. No prayers, rites, church
  details or anything only some Christians believe. No living people, no
  churches of today.

"What would you do?" (kindness): two situations from a six-year-old's life -
home, nursery, friends, toys - about TODAY'S RULE only. Never about God, the
Bible or believing. All three options are kind and polite; one is the kindest
(best), and "why" says in one short line why it is kindest. None is silly, rude
or bad. The situations come from ordinary child life only: home, nursery,
friends, toys, a grown-up. Nothing from games, films or hobbies.

"sayIt" is one short sentence copied word for word from your story.`;

function describeCard(card: StoryCard): string {
  return [
    `Story: ${card.title} (${card.reference})`,
    "Facts, in order:",
    ...card.facts.map((f, i) => `${i + 1}. ${f.say}`),
    `Do not add or talk about: ${card.never.say}`,
    `Today's rule: ${card.value.rule}`,
    card.knows.length ? `The child already knows: ${card.knows.join(" ")}` : "The child knows nothing yet.",
  ].join("\n");
}

/**
 * Who the story is for: name, age and level only. Not their interests or the
 * tutor's note about them - those made "What would you do?" situations that
 * did not fit the rule ("sing a happy dance song while getting dressed").
 */
function learnerLine(student: Student): string {
  const p = student.profile ?? {};
  return [`Learner: ${student.name}`, p.age ? `Age: ${p.age}` : "Age: a young child", p.level ? `English level: ${p.level}` : ""]
    .filter(Boolean)
    .join("\n");
}

function userPrompt(student: Student, card: StoryCard, review?: StoryCard, problems?: string[]): string {
  return [
    learnerLine(student),
    "",
    describeCard(card),
    review
      ? `\nThe child did not quite get the last story yet. In "recap", retell it very briefly first (30 to 70 words, the same rules), using these facts in order:\n${recapFacts(review).map((f, i) => `${i + 1}. ${f.say}`).join("\n")}`
      : '\nLeave "recap" empty.',
    problems?.length
      ? `\nYour last try did not pass these checks - fix them:\n${problems.map((p) => `- ${p}`).join("\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Everything wrong with a retelling, in words the model can act on. */
function problemsWith(retold: Retold, card: StoryCard, review?: StoryCard): string[] {
  const text = retold.paragraphs.join("\n");
  const problems: string[] = [];
  // The frame comes first, before any question or anything else.
  const frame = card.facts.find((f) => f.frame);
  const first = sentences(text)[0] ?? "";
  if (frame && !frame.check.every((entry) => (Array.isArray(entry) ? entry.some((e) => has(first, e)) : has(first, entry)))) {
    problems.push(`The very first sentence must be: "This is a story from the Bible." It is now: "${first}"`);
  }
  // No sentence twice, word for word.
  const seen = new Set<string>();
  const twice = new Set<string>();
  for (const line of sentences(text)) {
    const key = plain(line);
    if (key.split(" ").length < 3) continue;
    if (seen.has(key)) twice.add(line);
    seen.add(key);
  }
  for (const line of twice) problems.push(`This sentence is there twice; say it once: "${line}"`);
  // New words: really in the story, and never "Bible" itself.
  for (const w of retold.newWords) {
    if (hasWord(w, "bible")) problems.push(`"${w}" is not a new word to list; leave "Bible" out of the new words.`);
    else if (!hasWord(text, w.trim())) problems.push(`The new word "${w}" is not in the story; list only words the story uses.`);
  }
  for (const fact of missingFacts(text, card)) problems.push(`This fact is missing or not said plainly: "${fact}"`);
  const bad = forbiddenIn(text, card);
  if (bad.length) problems.push(`The story uses words it must not: ${bad.join(", ")}`);
  const n = wordCount(retold.paragraphs);
  if (n < STORY_WORDS.min || n > STORY_WORDS.max) {
    problems.push(`The story is ${n} words; it must be ${STORY_WORDS.min} to ${STORY_WORDS.max}.`);
  }
  for (const q of unanswerable(text, card.questions)) problems.push(`The story does not answer: "${q}"`);
  if (review) {
    const recap = retold.recap.join("\n");
    const r = wordCount(retold.recap);
    if (r < RECAP_WORDS.min || r > RECAP_WORDS.max) problems.push(`The recap is ${r} words; it must be ${RECAP_WORDS.min} to ${RECAP_WORDS.max}.`);
    for (const fact of missingFacts(recap, review, true)) problems.push(`The recap is missing: "${fact}"`);
    const badRecap = forbiddenIn(recap, review);
    if (badRecap.length) problems.push(`The recap uses words it must not: ${badRecap.join(", ")}`);
    for (const q of unanswerable(recap, review.questions.slice(0, 2))) problems.push(`The recap does not answer: "${q}"`);
  }
  retold.kindness.forEach((k, i) => {
    const all = [k.situation, ...k.options, k.why].join(" ");
    const banned = [...forbiddenIn(all), ...["god", "bible", "believe"].filter((w) => hasWord(all, w))];
    if (banned.length) problems.push(`Situation ${i + 1} uses words it must not: ${banned.join(", ")}`);
    if (new Set(k.options.map((o) => o.trim().toLowerCase())).size !== 3) problems.push(`Situation ${i + 1} needs three different options.`);
  });
  return problems;
}

/** The sentence to say back: from the story as written, or the rule. */
function sayItLine(retold: Retold, card: StoryCard): string {
  const story = retold.paragraphs.join(" ").replace(/\s+/g, " ").toLowerCase();
  const line = retold.sayIt.trim();
  const plain = line.toLowerCase().replace(/[.!?"“”]+$/g, "").replace(/^["“]/, "");
  return line.split(/\s+/).length <= 10 && story.includes(plain) ? line : card.value.rule;
}

// ---------------------------------------------------------------------------
// The homework
// ---------------------------------------------------------------------------

/** The text did not pass the checks twice: nothing is built, nothing sent. */
export class StoryNotBuilt extends Error {}

function shuffled<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** A card question as a round, the right answer somewhere at random. */
function questionRound(q: StoryQuestion): QuestionRound {
  const options = shuffled([q.answer, ...q.wrong]);
  return { question: q.question, options, answer: options.indexOf(q.answer), why: q.why };
}

function kindRound(k: Retold["kindness"][number]): KindRound {
  const order = shuffled([0, 1, 2]);
  return {
    situation: k.situation.trim(),
    options: order.map((i) => k.options[i].trim()),
    best: order.indexOf(k.best),
    why: k.why.trim(),
  };
}

export type StoryHomework = { homework: Homework; parentMessage: ParentMessage };

/**
 * Retell the story, check it, and build the homework around it. The questions
 * and the order of events come from the card as written; the model writes the
 * text and the "what would you do?" situations. One more try if the checks
 * fail, then StoryNotBuilt.
 */
export async function buildStoryHomework(
  student: Student,
  card: StoryCard,
  review?: StoryCard,
): Promise<StoryHomework> {
  let problems: string[] = [];
  let retold: Retold | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    let candidate: Retold;
    try {
      candidate = await complete({
        system: SYSTEM,
        user: userPrompt(student, card, review, problems),
        schema: Retelling,
        schemaName: "Story",
        maxTokens: 6000,
        effort: "low",
        timeoutMs: 60_000,
        fallbackModel: MODEL_FAST,
        outputLanguage: "English",
      });
    } catch (e) {
      console.error("[christianity] model", e);
      problems = ["The answer did not come back in the right shape."];
      continue;
    }
    problems = problemsWith(candidate, card, review);
    if (problems.length === 0) {
      retold = candidate;
      break;
    }
    console.warn(`[christianity] ${card.id} try ${attempt + 1} failed: ${problems.join(" | ")}`);
  }
  if (!retold) throw new StoryNotBuilt("Could not build it. Try again.");

  const pages: ReadPage[] = [];
  if (review) {
    pages.push({
      heading: `Remember? ${review.title}`,
      paragraphs: retold.recap.map((p) => p.trim()),
      pictures: review.pictures.slice(0, 1).map((p) => ({ src: p.file, alt: p.alt })),
    });
  }
  pages.push({
    heading: card.title,
    paragraphs: retold.paragraphs.map((p) => p.trim()),
    pictures: card.pictures.map((p) => ({ src: p.file, alt: p.alt })),
  });

  const topic = `Bible story: ${card.title}`;
  const exercises: Exercise[] = [];
  if (review) {
    exercises.push({
      kind: "recall",
      title: "Do you remember?",
      topic: `Bible story: ${review.title}`,
      rounds: review.questions.slice(0, 2).map(questionRound),
    });
  }
  exercises.push(
    { kind: "questions", title: "About the story", topic, rounds: card.questions.map(questionRound) },
    {
      kind: "order",
      title: "What came first?",
      topic,
      rounds: [{ events: card.sequence, why: card.sequence.join(" Then: ") }],
    },
    { kind: "kindness", title: "What would you do?", topic: card.value.rule, rounds: retold.kindness.map(kindRound) },
    {
      kind: "repeat",
      title: "Say it with me",
      topic,
      rounds: [
        { sentence: sayItLine(retold, card), tip: "Say it slowly, like the story." },
        { sentence: card.value.closing.replace(/^Today:\s*/i, "").replace(/^./, (c) => c.toUpperCase()), tip: "This is today's good rule." },
      ],
    },
  );

  const words = wordCount(retold.paragraphs);
  const checks = [
    `All ${card.facts.length} facts from the card are in the story.`,
    "Nothing from the “never” lists.",
    `${words} words (${STORY_WORDS.min}–${STORY_WORDS.max}).`,
    "Every question has one right answer, and the story holds it.",
    ...(review ? [`Starts with a short recap of “${review.title}”.`] : []),
  ];

  return {
    homework: {
      focus: "Listen to the story as many times as you like.",
      exercises,
      read: { pages, closing: card.value.closing, newWords: retold.newWords, checks },
    },
    parentMessage: parentMessageFor(student, card),
  };
}

// ---------------------------------------------------------------------------
// How the child sees it
// ---------------------------------------------------------------------------

/**
 * A Bible story keeps the learner's colours but none of their theme's words:
 * no "Animal Dance Party homework", no "You danced with the animals!" at the
 * end of a story. The name is the story's title; the last word is its value.
 */
export function storyStyle(style: GameStyle, card: StoryCard): GameStyle {
  return {
    ...style,
    name: card.title,
    words: {
      heading: card.title,
      start: "Start",
      step: "Part",
      reward: "points",
      submit: "Check",
      cheer: "Well done!",
      // The value itself is the line under it (read.closing), said once.
      done: "You finished today's story.",
    },
  };
}

// ---------------------------------------------------------------------------
// The parent's message
// ---------------------------------------------------------------------------

/** The one line about the story and its value. Victor checks the wording. */
export function parentLine(card: StoryCard): { en: string; zh: string } {
  return {
    en: `Today's story: ${card.title}. Today's good habit: ${card.value.rule}`,
    zh: `今天的故事：${card.zhTitle}。今天的好习惯：${card.value.zh}。`,
  };
}

function parentMessageFor(student: Student, card: StoryCard): ParentMessage {
  const line = parentLine(card);
  return {
    en: `Today ${student.name} has a story from the Bible to read and listen to at home, with a few questions about it in English.\n\n${line.en}`,
    zh: `今天${student.name}的作业是一个圣经里的儿童故事：可以在家里读一读、听一听，然后用英语回答几个关于故事的问题。\n\n${line.zh}`,
    generatedAt: new Date().toISOString(),
    model: "template",
  };
}

/** After the tutor edits the English: the line goes back if it was lost. */
export function keepParentLine(lesson: Lesson, en: string, zh: string): { en: string; zh: string } {
  const card = cardById(lesson.module?.storyId);
  if (!card) return { en, zh };
  const line = parentLine(card);
  return {
    en: en.includes(line.en) ? en : `${en.trim()}\n\n${line.en}`,
    zh: zh.includes(line.zh) ? zh : `${zh.trim()}\n\n${line.zh}`,
  };
}

// ---------------------------------------------------------------------------
// Moving on
// ---------------------------------------------------------------------------

/**
 * A finished story game moves the learner's place. Only the first play counts,
 * as everywhere: a replay from memory is not what they knew.
 *
 * - The story's questions: passed at PASS_SHARE or better. Either way the
 *   place moves on; a story not passed is recapped at the start of the next.
 * - The recap's questions: the recap is done, whatever the score.
 */
export async function recordStoryResult(
  lesson: Lesson,
  kind: string,
  right: number,
  total: number,
): Promise<void> {
  const programme = lesson.module;
  if (!programme || (kind !== "questions" && kind !== "recall")) return;
  const card = cardById(programme.storyId);
  const reviewed = cardById(programme.reviewOf);
  if (!card) return;
  const passed = total > 0 && right / total >= PASS_SHARE - 1e-9;
  await updateStudent(lesson.studentId, (s) => {
    const state = s.modules?.christianity;
    if (!state) return null;
    const next: ModuleState = { ...state, passed: [...state.passed] };
    if (kind === "questions") {
      next.position = Math.max(next.position, card.order + 1);
      if (passed) {
        if (!next.passed.includes(card.id)) next.passed.push(card.id);
        if (next.review === card.id) delete next.review;
      } else {
        next.review = card.id;
      }
    } else if (reviewed) {
      if (passed && !next.passed.includes(reviewed.id)) next.passed.push(reviewed.id);
      if (next.review === reviewed.id) delete next.review;
    }
    return { modules: { ...s.modules, christianity: next } };
  });
}
