import type { Homework, Lesson } from "./types";

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

/** How the games went, added up. `total` of 0 means there were none. */
export function gameScore(homework: Homework | undefined): {
  right: number;
  total: number;
  percent: number;
} {
  const results = homework?.results ?? [];
  const right = results.reduce((n, r) => n + r.right, 0);
  const total = results.reduce((n, r) => n + r.total, 0);
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
      const at = byTopic.get(result.topic) ?? { right: 0, total: 0 };
      // The first attempt, always: a child replaying from memory should not
      // make the picture look better than what they actually knew.
      at.right += result.firstRight ?? result.right;
      at.total += result.total;
      byTopic.set(result.topic, at);
    }
  }
  return [...byTopic.entries()]
    .map(([topic, n]) => ({
      topic,
      ...n,
      percent: n.total ? Math.round((n.right / n.total) * 100) : 0,
    }))
    // Weakest first: that is the one worth ten minutes at home.
    .sort((a, b) => a.percent - b.percent);
}
