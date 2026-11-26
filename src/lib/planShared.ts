import { DEFAULT_SHEETS, SHEET_KINDS, type PlanCard, type Sheet, type SheetKind, type VideoIdea } from "./types";

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

/** Each kind of printed sheet as the tutor sees it, in print order. */
export const SHEET_LABEL: Record<SheetKind, { name: string; what: string }> = {
  wordcards: { name: "Word cards", what: "the lesson's words, to cut out" },
  worksheet: { name: "Fill the gaps", what: "short sentences with a word missing" },
  coloring: { name: "Colouring page", what: "one thing from the lesson to colour in" },
  match: { name: "Match the word and the picture", what: "draw a line from each word to its picture" },
  wordsearch: { name: "Find the words", what: "the lesson's words hidden in a grid of letters" },
  reading: { name: "Read and answer", what: "a tiny text and three questions" },
};

/** The kinds this card prints: the tutor's ticks, or the three it always had. */
export function chosenKinds(card: Pick<PlanCard, "sheetKinds">): SheetKind[] {
  return card.sheetKinds ?? DEFAULT_SHEETS;
}

/** The sheets to print, in print order, only the ticked kinds. */
export function sheetsToPrint(card: Pick<PlanCard, "sheetKinds">, sheets: Sheet[]): Sheet[] {
  const on = chosenKinds(card);
  return SHEET_KINDS.filter((k) => on.includes(k)).flatMap((k) => sheets.filter((s) => s.kind === k));
}
