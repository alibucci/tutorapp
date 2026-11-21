import type { PlanCard, VideoIdea } from "./types";

/**
 * Plan helpers with nothing server-side in them, for the pages in the
 * browser and the slide document alike.
 */

/** A search link that opens in the browser. Built here, never by the model. */
export function videoSearchUrl(v: VideoIdea): string {
  const q = encodeURIComponent(v.query);
  return v.platform === "Bilibili"
    ? `https://search.bilibili.com/all?keyword=${q}`
    : `https://www.youtube.com/results?search_query=${q}`;
}

/** The saved pack still matches the lesson: nothing changed since. */
export function packFresh(card: Pick<PlanCard, "packAt" | "updatedAt">): boolean {
  return Boolean(card.packAt && card.packAt >= card.updatedAt);
}

export const PART_LABEL: Record<string, string> = {
  warmup: "Warm-up",
  words: "New words",
  activity: "Game",
  speaking: "Speaking",
  wrapup: "Wrap-up",
};

export const STATUS_LABEL: Record<PlanCard["status"], string> = {
  planned: "Planned",
  done: "Done",
  moved: "Moved",
};

/** Whether a time is within the last `ms`: for "still being written" states. */
export function within(iso: string | undefined, ms: number): boolean {
  return Boolean(iso && Date.now() - Date.parse(iso) < ms);
}
