import type { Lesson } from "./types";

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
