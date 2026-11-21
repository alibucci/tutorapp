import { z } from "zod";
import { MODEL_FAST, complete } from "./llm";
import { studentsOf, updateCard } from "./plans";
import { recordLiveStory, storyFor } from "./storySlides";
import { getLesson, getPlan, updateLesson, updatePlan } from "./store";
import { promptLabel, type Lesson, type PlanCard, type PlanCheck } from "./types";

/**
 * After a lesson taught from a plan card: what of the plan it reached.
 *
 * The plan's points are numbered and the model only says, per number, done,
 * partly or not reached - it cannot add a point the plan never had. The card
 * is then marked taught, and what was covered joins the children's history,
 * so the next plan does not repeat it.
 */

const CheckSchema = z.object({
  items: z.array(
    z.object({
      n: z.number().int(),
      status: z.enum(["done", "partial", "missed"]),
    }),
  ),
});

const SYSTEM = `You compare a lesson with its plan. You get the plan's points,
numbered, then what was said in the lesson and the tutor's notes afterwards.

For every point, say whether the lesson did it ("done"), did some of it
("partial") or did not get to it ("missed"). A word counts as done when it
was used or practised, not only mentioned once. Go by the evidence: the
tutor's notes count as much as the transcript, and where there is no
evidence either way, it is "missed".`;

/** What the plan asked for, as points to tick. */
export function planPoints(card: Pick<PlanCard, "goal" | "words" | "carried" | "story">): string[] {
  // A Bible story: what it has to tell, fact by fact, and today's habit.
  const story = storyFor(card.story?.storyId);
  if (story) return [...story.facts.filter((f) => !f.frame).map((f) => f.say), card.goal].filter(Boolean);
  return [
    ...(card.goal ? [card.goal] : []),
    ...card.words.map((w) => `the word "${w}"`),
    ...(card.carried ?? []),
  ];
}

const GROUP_PROMPT: Record<string, string> = {
  w: "What went well",
  h: "What was hard",
  n: "What next",
};

function render(lesson: Lesson, points: string[]): string {
  const transcript = lesson.transcript.length
    ? lesson.transcript.map((s) => s.text).join("\n")
    : "(no transcript: the tutor's notes are all there is)";
  const debrief = lesson.debrief
    .map((a) => {
      const group = a.promptId.match(/^([whn]):/);
      return `${group ? GROUP_PROMPT[group[1]] : promptLabel(a.promptId)}: ${a.text}`;
    })
    .join("\n");
  return [
    "PLAN POINTS",
    points.map((p, i) => `${i + 1}. ${p}`).join("\n"),
    "",
    "WHAT WAS SAID IN THE LESSON",
    transcript,
    "",
    "THE TUTOR'S NOTES AFTER THE LESSON",
    debrief || "(none)",
  ].join("\n");
}

export async function checkPlan(lesson: Lesson, card: PlanCard): Promise<PlanCheck> {
  const points = planPoints(card);
  const result: PlanCheck = { done: [], partial: [], missed: [], at: new Date().toISOString() };
  if (!points.length) return result;
  const parsed = await complete({
    system: SYSTEM,
    user: render(lesson, points),
    schema: CheckSchema,
    schemaName: "PlanCheck",
    maxTokens: 3000,
    effort: "low",
    model: MODEL_FAST,
    timeoutMs: 75_000,
  });
  const status = new Map(parsed.items.map((i) => [i.n, i.status]));
  points.forEach((p, i) => {
    const s = status.get(i + 1) ?? "missed";
    result[s].push(p);
  });
  return result;
}

/**
 * Check the lesson against its card and record it: on the lesson, and on the
 * card (taught, with what it covered). Never throws - a lesson without this
 * check is still a whole lesson.
 */
export async function runPlanCheck(lessonId: string, summaryCovered: string[] = []): Promise<PlanCheck | null> {
  try {
    const lesson = await getLesson(lessonId);
    if (!lesson?.planCard || lesson.planCheck) return lesson?.planCheck ?? null;
    const plan = await getPlan(lesson.planCard.planId);
    const card = plan?.cards.find((c) => c.id === lesson.planCard!.cardId);
    if (!plan || !card) return null;
    const check = await checkPlan(lesson, card);
    await updateLesson(lessonId, (current) => (current.planCheck ? null : { planCheck: check }));
    await updateCard(plan.id, card.id, (now) => ({
      status: "done",
      lessonId,
      covered: [...new Set([...(now.covered ?? []), ...check.done, ...check.partial, ...summaryCovered])],
    }));
    // A story told in the lesson: the homework moves on with it.
    const story = storyFor(card.story?.storyId);
    if (story && card.status !== "done") await recordLiveStory((await studentsOf(plan)).students, story);
    return check;
  } catch (e) {
    console.error("[plan check]", e);
    return null;
  }
}

/** Add what the summary says was covered to the card's history. */
export async function recordCovered(lesson: Lesson, covered: string[]) {
  if (!lesson.planCard || !covered.length) return;
  await updateCard(lesson.planCard.planId, lesson.planCard.cardId, (now) => ({
    covered: [...new Set([...(now.covered ?? []), ...covered])],
  }));
}

/**
 * The tutor's answer on what the lesson did not reach: carried into the next
 * card still to teach, or left. Returns the card it went to.
 */
export async function carryOver(lesson: Lesson, accept: boolean): Promise<{ to?: string } | null> {
  if (!lesson.planCard || !lesson.planCheck || lesson.planCheck.carried) return null;
  const rest = [...lesson.planCheck.missed, ...lesson.planCheck.partial];
  let to: string | undefined;
  if (accept && rest.length) {
    const { planId, cardId } = lesson.planCard;
    await updatePlan(planId, (plan) => {
      const at = plan.cards.findIndex((c) => c.id === cardId);
      const next = plan.cards.find((c, i) => i > at && c.status === "planned") ??
        plan.cards.find((c) => c.id !== cardId && c.status === "planned");
      if (!next) return null;
      to = next.topic;
      return {
        cards: plan.cards.map((c) =>
          c.id === next.id
            ? { ...c, carried: [...new Set([...(c.carried ?? []), ...rest])], updatedAt: new Date().toISOString() }
            : c,
        ),
      };
    });
  }
  await updateLesson(lesson.id, (current) =>
    current.planCheck ? { planCheck: { ...current.planCheck, carried: accept && to ? "yes" : "no" } } : null,
  );
  return { to };
}
