import type { ExerciseResult, Homework, Lesson, RoundAnswer } from "./types";

/**
 * Homework has gone out by itself since this release. Lessons made before it
 * keep the old way - the tutor sends - so opening an old lesson never sends
 * something a tutor chose to hold back.
 */
export const AUTO_SINCE = "2026-11-17T21:00:00.000Z"; // 18 Nov, 02:00 in UTC+5

/**
 * Whether this lesson's homework is one that goes out by itself.
 *
 * Never a Bible story: it is prepared by itself, but the tutor opens the
 * overview and sends it (Viktor, 24 Nov) - a story is not sent unseen.
 */
export function sendsItself(lesson: Pick<Lesson, "createdAt" | "module" | "review">): boolean {
  // A Smart Review is sent by the tutor, or by the learning schedule.
  if (lesson.module || lesson.review) return false;
  return lesson.createdAt >= AUTO_SINCE;
}

/** XP a finished quest is worth, and how much a level takes. */
export const XP_PER_QUEST = 30;
export const XP_PER_LEVEL = 90;

/** Where a lesson's homework picture is served, for whichever way in. */
export function homeworkImageUrl(lesson: Lesson, key?: string): string | null {
  const file = lesson.homework?.imageFile;
  if (!file) return null;
  const k = key ? `&key=${encodeURIComponent(key)}` : "";
  return `/api/lessons/${lesson.id}/homework/image?f=${file}${k}`;
}

/**
 * Whether the child has finished everything this homework asked.
 *
 * Homework can be games, a picture, or both, so "handed in" is not one field:
 * every game needs a score, and a picture needs its written answers.
 */
export function homeworkDone(homework: Homework | undefined): boolean {
  if (!homework?.sentAt) return false;
  const games = homework.exercises ?? [];
  const results = homework.results ?? [];
  const gamesDone = games.every((e) => results.some((r) => r.kind === e.kind));
  const pictureDone = !homework.imageFile || Boolean(homework.answers);
  if (games.length === 0 && !homework.imageFile) return false;
  return gamesDone && pictureDone;
}

/**
 * Whether a game's result is a score. "What would you do?" is not: every
 * option in it is a kind one, so it never counts for or against the child -
 * results saved before that rule (a real right/total) are left out as well.
 */
export function scored(result: { kind: string; total: number }): boolean {
  return result.kind !== "kindness" && result.total > 0;
}

/** Games answered out loud: an empty answer there is silence, not a mistake. */
const SPOKEN = new Set(["repeat", "dialogue", "speak"]);

/**
 * A round nobody could mark: skipped, or nothing heard. Results saved before
 * `skipped` existed wrote these as "(nothing)" and counted them wrong.
 */
export function unassessed(kind: string, round: RoundAnswer): boolean {
  return Boolean(round.skipped) || (SPOKEN.has(kind) && /^\(nothing/.test(round.answered));
}

/**
 * One game's score, counting only the rounds that were really marked - the
 * one rule every page uses, so the tutor's and the parent's numbers agree.
 * "first" is the first attempt: a replay from memory must not make it look
 * better than what the child knew.
 */
export function resultScore(r: ExerciseResult, attempt: "latest" | "first" = "latest"): { right: number; total: number } {
  if (r.kind === "kindness") return { right: 0, total: 0 };
  let right = r.right;
  let total = r.total;
  if (r.rounds?.length) {
    const marked = r.rounds.filter((x) => !unassessed(r.kind, x));
    right = marked.filter((x) => x.right).length;
    total = marked.length;
  }
  if (attempt === "first" && r.firstRight !== undefined) {
    if (r.firstTotal !== undefined) return { right: r.firstRight, total: r.firstTotal };
    // Older results kept no first total: the marked rounds stand in for it.
    return { right: Math.min(r.firstRight, total), total };
  }
  return { right, total };
}

/** How the games went, added up. `total` of 0 means nothing was marked yet. */
export function gameScore(homework: Homework | undefined): {
  right: number;
  total: number;
  percent: number;
} {
  const scores = (homework?.results ?? []).map((r) => resultScore(r));
  const right = scores.reduce((n, r) => n + r.right, 0);
  const total = scores.reduce((n, r) => n + r.total, 0);
  return { right, total, percent: total ? Math.round((right / total) * 100) : 0 };
}

/**
 * How the child is doing on each thing they have practised, across every
 * homework. This is what a parent actually wants: not "did they do it" but
 * "is the thing they kept getting wrong getting better".
 */
export function progressByTopic(
  lessons: Lesson[],
): { topic: string; right: number; total: number; percent: number }[] {
  const byTopic = new Map<string, { right: number; total: number }>();
  for (const lesson of lessons) {
    for (const result of lesson.homework?.results ?? []) {
      // The first attempt, always: a child replaying from memory should not
      // make the picture look better than what they actually knew.
      const first = resultScore(result, "first");
      // Nothing marked - skipped, or not heard - is no data, not a low score.
      if (!first.total) continue;
      const at = byTopic.get(result.topic) ?? { right: 0, total: 0 };
      at.right += first.right;
      at.total += first.total;
      byTopic.set(result.topic, at);
    }
  }
  return [...byTopic.entries()]
    .map(([topic, n]) => ({
      topic,
      ...n,
      percent: Math.round((n.right / n.total) * 100),
    }))
    // Weakest first: that is the one worth ten minutes at home.
    .sort((a, b) => a.percent - b.percent);
}
