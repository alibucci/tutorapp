import { randomUUID } from "crypto";
import { z } from "zod";
import { PROGRAMME, cardById, christianityOpenTo, forbiddenIn, missingFacts, moduleOn } from "./christianity";
import { MODEL_FAST, complete } from "./llm";
import { updateStudent } from "./store";
import type { StoryCard } from "@/content/christianity/genesis";
import type { ModuleState, Slide, Student } from "./types";

/**
 * The Christianity track for live lessons: a Bible story told by the tutor
 * over slides, from the same seven cards as the homework.
 *
 * The same rules as the homework, because they are the point of it:
 * - the model tells the story; code checks every fact on the card is there and
 *   no forbidden word is anywhere, slides and notes alike, before anyone sees it;
 * - the questions, the order of events, today's habit and the pictures come
 *   from the card as written - ready-made drawings checked by eye, never a
 *   model's (no figure for God, nothing frightening, no brands);
 * - it exists only while the programme is open to the tutor and switched on
 *   (with the parent's request) for every child the lesson is for;
 * - one place in the programme: a story told in a lesson moves the same
 *   "where we are" the homework uses, so the homework does not fall behind.
 */

/** The track is open: programme open to the tutor, switched on for every child. */
export async function storyOpen(tutorId: string, students: Student[]): Promise<boolean> {
  if (!students.length || !students.every(moduleOn)) return false;
  return christianityOpenTo({ role: "tutor", id: tutorId, name: "" });
}

/**
 * The next story for these children. A group goes from the child furthest
 * behind, so nobody skips one.
 */
export function nextLiveStory(students: Student[]): StoryCard | undefined {
  const positions = students.map((s) => s.modules?.christianity?.position ?? 0);
  const at = positions.length ? Math.min(...positions) : 0;
  return PROGRAMME.find((c) => c.order === at);
}

export function storyFor(storyId: string | undefined): StoryCard | undefined {
  return cardById(storyId);
}

const Told = z.object({
  parts: z
    .array(
      z.object({
        text: z.string().min(5).max(200).describe("One or two short sentences of the story, for one slide"),
        notes: z.string().min(5).max(400).describe("For the tutor: how to tell this part, what to point at or ask"),
      }),
    )
    .min(3)
    .max(7),
  warmup: z.string().min(5).max(300).describe("For the tutor: a calm way to begin, one gentle question"),
});

const SYSTEM = `You tell one Bible story for a live English lesson with a
young child (or a few children) who are beginners and know nothing about the
Bible yet. The tutor shows it on slides, one short part at a time, and reads it
aloud.

THE STORY CARD BELOW IS THE WHOLE STORY. Tell exactly the facts on the card, in
that order, and nothing else: no extra events, people or animals, no meaning or
moral of your own. Every fact must be said plainly - the card's words, or as
close as English allows.

- The very first part begins with exactly: "This is a story from the Bible."
- Christians' beliefs are said as theirs ("Christians believe...").
- English for beginners (A1): short sentences, common words. Each part is one
  or two short sentences - it is a slide, not a page.
- Warm and calm. Nothing about punishment, fear, hell or sin, no prayers or
  church, no living people.
- Today's habit is not in the story; it has its own slide.
- The notes are for the tutor only, in the same spirit: what to point at, a
  gentle question. They follow the same rules as the story.`;

function describe(card: StoryCard): string {
  return [
    `Story: ${card.title} (${card.reference})`,
    "Facts, in order:",
    ...card.facts.map((f, i) => `${i + 1}. ${f.say}`),
    `Do not add or talk about: ${card.never.say}`,
    card.knows.length ? `The children already know: ${card.knows.join(" ")}` : "The children know nothing yet.",
  ].join("\n");
}

export class StorySlidesNotBuilt extends Error {}

const shuffle = <T,>(items: T[]): T[] => {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

/** Everything wrong with a telling, in words the model can act on. */
function problemsWith(told: z.infer<typeof Told>, card: StoryCard): string[] {
  const story = told.parts.map((p) => p.text).join(" ");
  const all = [story, told.warmup, ...told.parts.map((p) => p.notes)].join("\n");
  const problems: string[] = [];
  if (!/^\s*this is a story from the bible\b/i.test(told.parts[0]?.text ?? "")) {
    problems.push('The first part must begin with exactly: "This is a story from the Bible."');
  }
  for (const fact of missingFacts(story, card)) problems.push(`This fact is missing or not said plainly: "${fact}"`);
  const bad = forbiddenIn(all, card);
  if (bad.length) problems.push(`Words it must not use, in the story or the notes: ${bad.join(", ")}`);
  return problems;
}

/**
 * The slides for one story. Told by the model, checked by code; two tries,
 * then nothing - a story that does not pass is never shown.
 */
export async function buildStorySlides(card: StoryCard, ages: number[]): Promise<Slide[]> {
  const who = ages.length ? `Ages: ${ages.join(", ")}.` : "A young child.";
  let problems: string[] = [];
  let told: z.infer<typeof Told> | null = null;
  for (let attempt = 0; attempt < 2 && !told; attempt++) {
    const parsed = await complete({
      system: SYSTEM,
      user: [who, "", describe(card), problems.length ? `\nYour last try did not pass these checks - fix them:\n${problems.map((p) => `- ${p}`).join("\n")}` : ""].join("\n"),
      schema: Told,
      schemaName: "LiveStory",
      maxTokens: 4000,
      effort: "low",
      timeoutMs: 90_000,
      fallbackModel: MODEL_FAST,
    });
    problems = problemsWith(parsed, card);
    if (!problems.length) told = parsed;
  }
  if (!told) {
    throw new StorySlidesNotBuilt(`The story did not pass its checks: ${problems.slice(0, 3).join(" ")}`);
  }

  const art = card.pictures.map((p) => p.file);
  const slides: Slide[] = [
    { id: randomUUID(), part: "warmup", title: card.title, emoji: "📖", ...(art[0] && { art: art[0] }), notes: told.warmup },
    ...told.parts.map((p, i) => ({
      id: randomUUID(),
      part: "words" as const,
      title: "",
      text: p.text,
      say: p.text.length <= 80 ? p.text : undefined,
      notes: p.notes,
      // The two drawings, spread over the story.
      ...(art.length && { art: art[Math.min(art.length - 1, Math.floor((i * art.length) / told!.parts.length))] }),
    })),
    {
      id: randomUUID(),
      part: "activity",
      title: "What happened first?",
      text: shuffle(card.sequence).join("  ·  "),
      emoji: "🔢",
      notes: `Put them in order together. The order: ${card.sequence.map((s, i) => `${i + 1}. ${s}`).join(" ")}`,
    },
    ...card.questions.map((q) => ({
      id: randomUUID(),
      part: "activity" as const,
      title: q.question,
      text: shuffle([q.answer, ...q.wrong]).join("  ·  "),
      emoji: "❓",
      notes: `Answer: ${q.answer}. ${q.why}`,
    })),
    {
      id: randomUUID(),
      part: "speaking",
      title: card.value.rule,
      say: card.value.rule,
      emoji: "💛",
      notes: "Today's good habit. Say it together, then ask when they could do it at home or with friends.",
    },
    { id: randomUUID(), part: "wrapup", title: card.value.closing, emoji: "🌟", notes: "Say goodbye warmly. The homework story comes next." },
  ];
  return slides.map((s) => Object.fromEntries(Object.entries(s).filter(([, v]) => v !== undefined)) as Slide);
}

/**
 * A story told in a lesson moves each child's place in the programme, the
 * same "where we are" the homework uses: past this story, and the story
 * counted as passed.
 */
export async function recordLiveStory(students: Student[], card: StoryCard): Promise<void> {
  for (const student of students) {
    await updateStudent(student.id, (s) => {
      const state = s.modules?.christianity;
      if (!state) return null;
      const next: ModuleState = {
        ...state,
        position: Math.max(state.position, card.order + 1),
        passed: state.passed.includes(card.id) ? state.passed : [...state.passed, card.id],
      };
      if (next.review === card.id) delete next.review;
      return { modules: { ...s.modules, christianity: next } };
    });
  }
}
