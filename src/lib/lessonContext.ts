import { contextOf, wordPoint, type LessonContext } from "./coverage";
import { storyFor } from "./storySlides";
import { getLesson, getPlan } from "./store";
import type { Lesson, PlanCard } from "./types";

/**
 * What of its plan a lesson reached, read from the store. Its own module, away
 * from the plan check's model call and the plans' background work, so the
 * homework (exercises.ts) and Smart Review can import it without pulling
 * those in - plans.ts imports exercises.ts, and that would go round in a
 * circle.
 */

export type { LessonContext };

/** What the plan asked for, as points to tick. */
export function planPoints(card: Pick<PlanCard, "goal" | "words" | "carried" | "story">): string[] {
  // A Bible story: what it has to tell, fact by fact, and today's habit.
  const story = storyFor(card.story?.storyId);
  if (story) return [...story.facts.filter((f) => !f.frame).map((f) => f.say), card.goal].filter(Boolean);
  return [
    ...(card.goal ? [card.goal] : []),
    ...card.words.map(wordPoint),
    ...(card.carried ?? []),
  ];
}

/**
 * The lesson that holds the plan check for this one, read fresh: a child's
 * lesson split from a group is checked once, on the group lesson. Null when
 * the lesson was not taught from a plan.
 */
export async function checkedLesson(lesson: Pick<Lesson, "id" | "planCard" | "groupId">): Promise<Lesson | null> {
  const holder = lesson.groupId ? await getLesson(lesson.groupId) : lesson.planCard ? await getLesson(lesson.id) : null;
  return holder?.planCard ? holder : null;
}

/**
 * What of its plan a lesson reached, for anything that builds practice on
 * it - the lesson's homework now, Smart Review later. Read only: it never
 * runs a check (ensurePlanCheck in planCheck.ts does, before games are
 * built). Null when the lesson was not taught from a plan, or the card is
 * gone. Points with no check behind them come back as needing confirmation.
 */
export async function lessonContext(lesson: Pick<Lesson, "id" | "planCard" | "groupId">): Promise<LessonContext | null> {
  const holder = await checkedLesson(lesson);
  if (!holder?.planCard) return null;
  const { planId, cardId } = holder.planCard;
  const card = (await getPlan(planId))?.cards.find((c) => c.id === cardId);
  if (!card) return null;
  return contextOf(planPoints(card), holder.planCheck, card, holder.id !== lesson.id);
}
