import type { PlanCard, PlanCheck, Slide } from "./types";

/**
 * What a lesson taught from a plan card actually reached, in a form the
 * homework (and later Smart Review) can build on: covered, partly covered,
 * planned but not reached, and points nobody can say either way.
 *
 * Pure, so it can be tested and read anywhere. The store side - finding the
 * card and the check for a lesson - is lessonContext.ts.
 */

export type LessonContext = {
  /** Plan points the lesson did. */
  covered: string[];
  /** Plan points it did some of. */
  partly: string[];
  /** Plan points it did not get to: the learner has not met them. */
  notReached: string[];
  /** No evidence either way, or no check at all: needs the tutor's confirmation. */
  unsure: string[];
  /** The card's planned words. */
  words: string[];
  goal?: string;
  /** A few slides on what was covered, as "Title: line". Shown is not learnt. */
  slides: string[];
  /** The check was made on a group lesson, for every child at once. */
  group?: boolean;
};

/** How planPoints (lessonContext.ts) names a word to learn. */
export const wordPoint = (word: string) => `the word "${word}"`;

/**
 * Sort the plan's points by what the check said. The check's own lists are
 * the record; a point it never mentions - no check yet, or a card edited
 * since - needs confirmation, not a guess. A check made before "unclear"
 * existed put no-evidence points under missed, and they stay there.
 */
export function sortPoints(
  points: string[],
  check: Pick<PlanCheck, "done" | "partial" | "missed" | "unclear"> | undefined,
): Pick<LessonContext, "covered" | "partly" | "notReached" | "unsure"> {
  const done = new Set(check?.done ?? []);
  const partial = new Set(check?.partial ?? []);
  const missed = new Set(check?.missed ?? []);
  const out = { covered: [] as string[], partly: [] as string[], notReached: [] as string[], unsure: [] as string[] };
  for (const point of [...new Set(points)]) {
    if (done.has(point)) out.covered.push(point);
    else if (partial.has(point)) out.partly.push(point);
    else if (missed.has(point)) out.notReached.push(point);
    else out.unsure.push(point);
  }
  return out;
}

const SLIDES_MAX = 5;

function clip(text: string, max: number): string {
  const t = text.trim().replace(/\s+/g, " ");
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

function mentions(text: string, word: string): boolean {
  const escaped = word.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return Boolean(escaped) && new RegExp(`(^|[^\\p{L}])${escaped}($|[^\\p{L}])`, "iu").test(text);
}

/**
 * The slides on words the lesson reached, kept short: never one that also
 * teaches a word it did not reach, since homework built on it would bring in
 * that word too.
 */
export function slidesOnCovered(slides: Pick<Slide, "title" | "text" | "say">[], reached: string[], notReached: string[]): string[] {
  if (!reached.length) return [];
  const out: string[] = [];
  for (const slide of slides) {
    const text = [slide.title, slide.text ?? "", slide.say ?? ""].join(" ");
    if (!reached.some((w) => mentions(text, w)) || notReached.some((w) => mentions(text, w))) continue;
    const line = clip(slide.text ? `${slide.title}: ${slide.text}` : slide.title, 140);
    if (line && !out.includes(line)) out.push(line);
    if (out.length >= SLIDES_MAX) break;
  }
  return out;
}

/** The whole context, from the card's points, its check and its materials. */
export function contextOf(
  points: string[],
  check: PlanCheck | undefined,
  card: Pick<PlanCard, "words" | "goal" | "materials">,
  group = false,
): LessonContext {
  const sorted = sortPoints(points, check);
  const wordsIn = (list: string[]) => card.words.filter((w) => list.includes(wordPoint(w)));
  const reached = wordsIn([...sorted.covered, ...sorted.partly]);
  const goal = card.goal.trim();
  return {
    ...sorted,
    words: card.words,
    ...(goal && { goal }),
    slides: slidesOnCovered(card.materials?.slides ?? [], reached, wordsIn(sorted.notReached)),
    ...(group && { group }),
  };
}

const list = (items: string[]) => items.join("; ");

/**
 * The context as a block for the homework prompt. The summary and the
 * tutor's notes stay the source of truth; this only says which of the plan
 * the lesson reached, so the homework does not practise what was never
 * taught.
 */
export function describeLessonContext(ctx: LessonContext): string {
  const lines = [
    "TAUGHT FROM A LESSON PLAN. What of the plan the lesson reached, read from the recording and the tutor's notes:",
    ctx.covered.length ? `Covered in the lesson: ${list(ctx.covered)}` : "",
    ctx.partly.length ? `Partly covered: ${list(ctx.partly)}` : "",
    ctx.unsure.length ? `Needs confirmation (no evidence either way - use only if the summary shows it): ${list(ctx.unsure)}` : "",
    ctx.notReached.length ? `Planned but NOT reached - do not use: ${list(ctx.notReached)}` : "",
    ctx.goal ? `The lesson's planned goal: ${ctx.goal}` : "",
    ctx.words.length ? `The lesson's planned words: ${ctx.words.join(", ")}` : "",
    ctx.slides.length
      ? `Slides shown on what was covered (shown is not the same as learnt):\n${ctx.slides.map((s) => `- ${s}`).join("\n")}`
      : "",
    ctx.group
      ? "This was a group lesson: the plan check is for the whole group. What this learner did and got wrong is their own summary above."
      : "",
  ].filter(Boolean);
  return lines.join("\n");
}

/** How the model reads that block. In the system prompt, only for a plan lesson. */
export const LESSON_CONTEXT_RULES = `A LESSON TAUGHT FROM A PLAN (when the lesson below was):
- Build only on what the lesson covered or partly covered. A point planned but
  NOT reached is not used anywhere - not as an answer, an option or an
  example word: the learner has not met it yet.
- A point that needs confirmation is used only where the summary or the
  tutor's notes show it happened.
- The summary and the tutor's notes are the source of truth. A slide having
  been shown does not mean it was learnt: practise what the learner found
  hard, not every slide.`;
