import { randomUUID } from "crypto";
import { z } from "zod";
import { MODEL_FAST, complete } from "./llm";
import { LEVELS } from "./profile";
import {
  SLIDE_PARTS,
  type LessonMaterials,
  type PlanCard,
  type Sheet,
  type Slide,
  type SlidePart,
  type SlideStep,
  type VideoIdea,
} from "./types";

/**
 * Lesson plans and materials, written by the model and checked here.
 *
 * What goes to the model about the children is their ages, levels and
 * interests - never a name. The cards are meant to be reused, and a card that
 * names a child cannot be.
 */

// ---------------------------------------------------------------------------
// Who the lesson is for
// ---------------------------------------------------------------------------

export type Learner = {
  age?: number;
  level?: string;
  /** The tutor's line about them and what they said they like. */
  interests: string;
};

/** The group as the model sees it: no names, the youngest and weakest first. */
export function describeLearners(learners: Learner[]): string {
  const ages = learners.map((l) => l.age).filter((a): a is number => typeof a === "number");
  const levelIndex = (id?: string) => LEVELS.findIndex((l) => l.id === id);
  const known = learners.map((l) => levelIndex(l.level)).filter((i) => i >= 0);
  const weakest = known.length ? LEVELS[Math.min(...known)].label : "not given (assume A1)";
  const lines = [
    learners.length === 1 ? "One child." : `A group of ${learners.length} children, taught together.`,
    ages.length
      ? `Ages: ${ages.join(", ")}. Build for the youngest (${Math.min(...ages)}).`
      : "Age: not given (assume about 7).",
    `English level: ${weakest}. Every word and sentence fits A1-A2${known.length > 1 ? ", for the weakest child" : ""}.`,
  ];
  const interests = learners.map((l) => l.interests.trim()).filter(Boolean);
  lines.push(
    interests.length
      ? `What they are into:\n${interests.map((i) => `- ${i}`).join("\n")}${
          learners.length > 1 ? "\nUse what they share; if nothing is shared, pick a neutral theme." : ""
        }`
      : "What they are into: not recorded - pick a neutral, friendly theme.",
  );
  return lines.join("\n");
}

/** Slides for a lesson of this length. */
export function slideCount(minutes: number): number {
  return minutes <= 30 ? 8 : minutes <= 45 ? 11 : 14;
}

// ---------------------------------------------------------------------------
// Shared rules
// ---------------------------------------------------------------------------

const RULES = `Rules for everything you write:
- English only on anything the children see. Short sentences, A1-A2 words.
- Do not invent facts. About animals, countries, nature or history, say only
  what is plainly true and well known; leave a fact out rather than guess.
- Games and tasks a child of this age can do in a room or on a video call. No
  timers or races against the clock, no losing points or "out" for a mistake.
- The children's interests are welcome in examples and themes. A description
  of a picture never names a brand, game, film, character or real person -
  say what it looks like instead. No religion, politics, fear or violence.
- Nothing about any particular child: no names, no personal details.`;

const WORD = z.string().trim().min(1).max(24);

// ---------------------------------------------------------------------------
// A month of cards
// ---------------------------------------------------------------------------

const MonthSchema = z.object({
  cards: z
    .array(
      z.object({
        topic: z.string().min(2).max(60).describe("The lesson's topic, a few words"),
        words: z.array(WORD).min(3).max(6).describe("3 to 6 English words or short phrases to learn"),
        goal: z.string().min(5).max(140).describe('What the children will do, e.g. "talk about animals, use can"'),
        link: z.string().max(140).describe("One short line on how it follows the lessons before"),
      }),
    )
    .min(1),
});

const MONTH_SYSTEM = `You plan a month of live English lessons for a tutor.
There is no textbook or school programme: the tutor leads, and you give them
an order of lessons that builds - each one uses what came before.

For each lesson give a topic, 3 to 6 words to learn, a short goal and a line
on how it links to the lessons before it.

Cover different everyday areas across the month - for example family, food,
the body, clothes, weather, home, school, actions, places, feelings. The
children's interests go into the examples and the themes of the lessons;
they are not the topic of every lesson. A child who loves cats gets a cat in
the food lesson, not a month about cats.

${RULES}
- Never repeat a topic the children have already had (listed below), and do
  not put the same topic twice in this plan.
- If the parents want something, work it in where it fits the children.`;

export type MonthCard = Pick<PlanCard, "topic" | "words" | "goal" | "link">;

export async function suggestMonth(opts: {
  learners: Learner[];
  count: number;
  minutes: number;
  parentWishes?: string;
  /** Topics already taught or already on the board. */
  had: string[];
}): Promise<MonthCard[]> {
  const user = [
    describeLearners(opts.learners),
    `Lessons: ${opts.count}, ${opts.minutes} minutes each.`,
    opts.parentWishes ? `The parents want: ${opts.parentWishes}` : "",
    opts.had.length ? `Already had (do not repeat):\n${opts.had.map((t) => `- ${t}`).join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  const parsed = await complete({
    system: MONTH_SYSTEM,
    user,
    schema: MonthSchema,
    schemaName: "MonthPlan",
    maxTokens: 6000,
    effort: "low",
    timeoutMs: 110_000,
    fallbackModel: MODEL_FAST,
  });
  const seen = new Set(opts.had.map((t) => t.trim().toLowerCase()));
  const cards: MonthCard[] = [];
  for (const c of parsed.cards) {
    const key = c.topic.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    cards.push({ topic: c.topic.trim(), words: cleanWords(c.words), goal: c.goal.trim(), link: c.link.trim() || undefined });
    if (cards.length >= opts.count) break;
  }
  return cards;
}

function cleanWords(words: string[]): string[] {
  const out: string[] = [];
  for (const w of words) {
    const word = w.trim().replace(/\s+/g, " ");
    // A phrase of more than three words is a sentence, not a word to learn.
    if (!word || word.length > 24 || word.split(" ").length > 3) continue;
    if (!out.some((x) => x.toLowerCase() === word.toLowerCase())) out.push(word);
  }
  return out.slice(0, 6);
}

// ---------------------------------------------------------------------------
// One lesson's materials
// ---------------------------------------------------------------------------

const SlideSchema = z.object({
  part: z.enum(SLIDE_PARTS),
  title: z.string().min(1).max(60).describe("Big words on the screen"),
  text: z.string().max(200).describe("A short line under the title, or empty"),
  say: z.string().max(80).describe("A word or phrase the Listen button reads aloud, or empty"),
  emoji: z.string().max(16).describe("One or two emoji that show the slide"),
  picture: z
    .string()
    .max(300)
    .describe("What a picture for this slide shows, for an image model; empty if none is needed"),
  notes: z.string().min(5).max(500).describe("For the tutor only: what to do and say on this slide"),
  harder: z
    .object({
      title: z.string().max(60),
      text: z.string().max(200),
      say: z.string().max(80),
    })
    .nullable()
    .optional()
    .catch(null)
    .describe("Groups only: the same slide one step up for the stronger children, or null"),
});

const VideoSchema = z.object({
  platform: z.enum(["YouTube", "Bilibili"]),
  query: z.string().min(3).max(80).describe("What to type into the search box"),
  what: z.string().min(3).max(120).describe("The kind of video to look for"),
});

const MaterialsSchema = z.object({
  topic: z.string().min(2).max(60),
  words: z.array(WORD).min(3).max(6),
  goal: z.string().min(5).max(140),
  slides: z.array(SlideSchema).min(1),
  videos: z.array(VideoSchema).max(4),
  worksheet: z
    .array(
      z.object({
        line: z.string().min(5).max(90).describe('A short sentence with one gap written as "___"'),
        answer: WORD.describe("The word that fills the gap"),
      }),
    )
    .max(6)
    .describe("4 to 6 fill-the-gap sentences using the lesson's words"),
  coloring: z
    .object({
      word: WORD.describe("One of the lesson's words"),
      picture: z.string().min(10).max(200).describe("One simple object or animal to colour in, for an outline drawing"),
    })
    .describe("A colouring page"),
});

const MATERIALS_SYSTEM = `You prepare one live English lesson: the slides a tutor
shows and talks through, and ideas for short videos to look up.

The lesson has five parts, in this order:
1. warmup - a friendly start that gets them talking (1 slide)
2. words - the new words, one or two per slide, with a picture idea
3. activity - a game or task using the words
4. speaking - the children say things themselves, with a model sentence
5. wrapup - what we learned, said together (1 slide)

A slide holds very little: a big title, at most one short line, a word or
phrase to listen to, an emoji. The tutor's notes say what to do and what to
ask - that is where the teaching goes, not on the slide.

Printed sheets: a fill-the-gap worksheet (4 to 6 short sentences, each with
one gap "___" that one of the lesson's words fills) and a colouring page of one
simple thing from the lesson.

Videos: 2 to 4 searches the tutor can run, for both YouTube and Bilibili
(YouTube does not open in mainland China without a VPN). These are search
ideas, not links; the tutor checks a video before showing it.

${RULES}`;

/**
 * A group: every child is kept busy. The slide is pitched at the weakest, and
 * the tutor can reveal a step up on top of it for the ones who are ready.
 */
const MIXED_LEVELS = `

This is a group, and children in a group are at different levels. On the
words, activity and speaking slides, also give "harder": the same idea one
step up for the stronger children - harder words on the same theme, a longer
sentence, a question to answer instead of a word to repeat. The tutor shows
it after the easy version, so the slide itself stays at the weakest child's
level. Its line, if any, adds something - a question, a second sentence -
rather than repeating its title. Warm-up and wrap-up need none (null).
Mention the step up in the notes.`;

const ONE_CHILD = `

This is one child: give "harder" as null on every slide.`;

export type SlideDraft = Omit<Slide, "id">;

export type BuiltMaterials = {
  topic: string;
  words: string[];
  goal: string;
  slides: Slide[];
  videos: VideoIdea[];
  sheets: Sheet[];
};

/**
 * The materials for one card. When rebuilding, `keep` holds the slides the
 * tutor changed by hand: they stay exactly where they are, and only the
 * others are written again.
 */
export async function buildMaterials(opts: {
  learners: Learner[];
  minutes: number;
  card: Pick<PlanCard, "topic" | "words" | "goal" | "carried">;
  parentWishes?: string;
  had: string[];
  wish?: string;
  keep?: { index: number; slide: Slide }[];
  current?: Slide[];
}): Promise<BuiltMaterials> {
  const total = slideCount(opts.minutes);
  const keep = (opts.keep ?? []).filter((k) => k.index < total);
  const toWrite = Math.max(1, total - keep.length);
  const topic = opts.card.topic.trim();

  const user = [
    describeLearners(opts.learners),
    `Lesson: ${opts.minutes} minutes, ${total} slides in all.`,
    topic ? `Topic: ${topic}` : "Topic: not chosen - pick one that suits these children.",
    opts.card.words.length ? `Words to learn: ${opts.card.words.join(", ")}` : "",
    opts.card.goal ? `Goal: ${opts.card.goal}` : "",
    opts.card.carried?.length
      ? `Not reached last time, include it: ${opts.card.carried.join("; ")}`
      : "",
    opts.parentWishes ? `The parents want: ${opts.parentWishes}` : "",
    opts.had.length ? `Topics they already had: ${opts.had.join("; ")}` : "",
    opts.current?.length
      ? `The lesson as it is now:\n${opts.current
          .map((s, i) => `${i + 1}. [${s.part}] ${s.title}${s.text ? ` - ${s.text}` : ""}`)
          .join("\n")}`
      : "",
    keep.length
      ? `The tutor changed these slides by hand. They stay exactly where they are; do not write them again:\n${keep
          .map((k) => `slide ${k.index + 1}: [${k.slide.part}] ${k.slide.title}`)
          .join("\n")}\nWrite the other ${toWrite} slides, in order, to fit around them.`
      : `Write all ${total} slides.`,
    opts.wish ? `The tutor asks: ${opts.wish}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const parsed = await complete({
    system: MATERIALS_SYSTEM + (opts.learners.length > 1 ? MIXED_LEVELS : ONE_CHILD),
    user,
    schema: MaterialsSchema,
    schemaName: "LessonMaterials",
    maxTokens: 8000,
    effort: "low",
    timeoutMs: 110_000,
    fallbackModel: MODEL_FAST,
  });

  const written = parsed.slides.map(cleanSlide).filter((s): s is SlideDraft => s !== null);
  if (!written.length) throw new Error("The lesson came back without slides. Try again.");
  const slides = mergeKept(written.slice(0, toWrite), keep, total);
  const words = opts.card.words.length ? opts.card.words : cleanWords(parsed.words);
  return {
    topic: topic || parsed.topic.trim(),
    words,
    goal: opts.card.goal || parsed.goal.trim(),
    slides,
    videos: cleanVideos(parsed.videos),
    sheets: makeSheets(topic || parsed.topic.trim(), words, parsed.worksheet, parsed.coloring),
  };
}

/** The kept slides back at their places, the new ones around them in order. */
export function mergeKept(
  written: SlideDraft[],
  keep: { index: number; slide: Slide }[],
  total: number,
): Slide[] {
  const out: Slide[] = [];
  const fresh = [...written];
  const kept = new Map(keep.map((k) => [k.index, k.slide]));
  const length = Math.max(total, ...keep.map((k) => k.index + 1));
  for (let i = 0; i < length; i++) {
    const own = kept.get(i);
    if (own) out.push(own);
    else if (fresh.length) out.push({ id: randomUUID(), ...fresh.shift()! });
  }
  // Whatever did not fit before the last kept slide goes on the end.
  for (const s of fresh) out.push({ id: randomUUID(), ...s });
  return out;
}

const ONE_SLIDE_SYSTEM = `You rewrite one slide of a live English lesson, as the
tutor asks. Keep it in its part of the lesson and in the lesson's topic.

${RULES}`;

/** One slide again, as the tutor asks. */
export async function rebuildSlide(opts: {
  learners: Learner[];
  card: Pick<PlanCard, "topic" | "words" | "goal">;
  slides: Slide[];
  index: number;
  wish: string;
}): Promise<Slide> {
  const old = opts.slides[opts.index];
  const user = [
    describeLearners(opts.learners),
    `Topic: ${opts.card.topic}. Words: ${opts.card.words.join(", ")}. Goal: ${opts.card.goal}`,
    `The lesson:\n${opts.slides.map((s, i) => `${i + 1}. [${s.part}] ${s.title}`).join("\n")}`,
    `Slide ${opts.index + 1} now: ${JSON.stringify({ part: old.part, title: old.title, text: old.text, say: old.say, notes: old.notes, harder: old.harder ?? null })}`,
    `The tutor asks: ${opts.wish}`,
  ].join("\n\n");
  const parsed = await complete({
    system: ONE_SLIDE_SYSTEM + (opts.learners.length > 1 ? MIXED_LEVELS : ONE_CHILD),
    user,
    schema: SlideSchema,
    schemaName: "Slide",
    maxTokens: 2000,
    effort: "low",
    timeoutMs: 60_000,
    fallbackModel: MODEL_FAST,
  });
  const clean = cleanSlide({ ...parsed, part: old.part });
  if (!clean) throw new Error("The slide came back empty. Try again.");
  return { id: old.id, ...clean };
}

function clip(text: string | undefined, max: number): string | undefined {
  const t = (text ?? "").trim().replace(/[ \t]+/g, " ");
  if (!t) return undefined;
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

/** A slide as it may be shown: short, and never empty. */
export function cleanSlide(raw: {
  part: SlidePart;
  title?: string;
  text?: string;
  say?: string;
  emoji?: string;
  picture?: string;
  notes?: string;
  harder?: { title?: string; text?: string; say?: string } | null;
}): SlideDraft | null {
  const title = clip(raw.title, 60);
  const text = clip(raw.text, 200);
  if (!title && !text) return null;
  const say = clip(raw.say, 80);
  const harder = cleanStep(raw.harder);
  return {
    part: SLIDE_PARTS.includes(raw.part) ? raw.part : "activity",
    title: title ?? "",
    ...(text && { text }),
    ...(say && say.split(" ").length <= 8 && { say }),
    ...(clip(raw.emoji, 16) && { emoji: clip(raw.emoji, 16) }),
    ...(clip(raw.picture, 300) && { picture: clip(raw.picture, 300) }),
    ...(clip(raw.notes, 500) && { notes: clip(raw.notes, 500) }),
    ...(harder && { harder }),
  };
}

/** The step up, if it says anything at all. */
function cleanStep(raw: { title?: string; text?: string; say?: string } | null | undefined): SlideStep | undefined {
  if (!raw) return undefined;
  const title = clip(raw.title, 60);
  const same = (a?: string, b?: string) => Boolean(a && b && a.replace(/\W/g, "").toLowerCase() === b.replace(/\W/g, "").toLowerCase());
  // A line that only repeats the title says nothing more.
  const text = same(clip(raw.text, 200), title) ? undefined : clip(raw.text, 200);
  if (!title && !text) return undefined;
  const say = clip(raw.say, 80);
  return { ...(title && { title }), ...(text && { text }), ...(say && say.split(" ").length <= 12 && { say }) };
}

function cleanVideos(videos: VideoIdea[]): VideoIdea[] {
  const out: VideoIdea[] = [];
  for (const v of videos) {
    const query = v.query.trim();
    if (!query || out.some((o) => o.platform === v.platform && o.query === query)) continue;
    out.push({ platform: v.platform, query, what: v.what.trim() });
  }
  return out.slice(0, 4);
}

/**
 * The printed pages. Word cards are the lesson's words, made here. A
 * worksheet line counts only with exactly one gap and an answer that fits
 * it; a colouring page always has its word, with or without a drawing.
 */
export function makeSheets(
  topic: string,
  words: string[],
  worksheet: { line: string; answer: string }[],
  coloring: { word: string; picture: string },
): Sheet[] {
  const sheets: Sheet[] = [];
  if (words.length) sheets.push({ id: randomUUID(), kind: "wordcards", title: `${topic}: word cards`, items: words });
  const lines = worksheet
    .map((w) => ({ line: w.line.trim().replace(/_{2,}/g, "___"), answer: w.answer.trim() }))
    .filter((w) => w.line.split("___").length === 2 && w.answer && w.answer.split(" ").length <= 3)
    .slice(0, 6);
  if (lines.length >= 3) {
    sheets.push({
      id: randomUUID(),
      kind: "worksheet",
      title: `${topic}: fill the gaps`,
      items: lines.map((l) => l.line),
      answers: lines.map((l) => l.answer),
    });
  }
  sheets.push({
    id: randomUUID(),
    kind: "coloring",
    title: `${topic}: colour it in`,
    items: [coloring.word.trim() || words[0] || topic],
    picture: coloring.picture.trim(),
  });
  return sheets;
}

/** Materials as stored on a card. */
export function asMaterials(built: BuiltMaterials, wish?: string): LessonMaterials {
  return {
    slides: built.slides,
    sheets: built.sheets,
    videos: built.videos,
    builtAt: new Date().toISOString(),
    ...(wish && { wish }),
  };
}
