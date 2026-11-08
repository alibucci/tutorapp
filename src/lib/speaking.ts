/**
 * Marking what a learner said or typed, for the speaking tasks.
 *
 * Speech arrives through the browser's recogniser, which mishears a word here
 * and there even when the learner said it well, and drops punctuation and
 * capitals. So a repeated sentence counts when most of its words came back in
 * order, not only when every character matches. Shared by the page, which
 * answers at once, and the server, which keeps the score.
 */

export function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[^a-z0-9' ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/** How much of the target came back, in order: 0 to 1. */
export function overlap(target: string, said: string): number {
  const a = words(target);
  const b = words(said);
  if (!a.length) return 0;
  // Longest common subsequence: order matters, a slip in one word does not
  // lose the rest.
  const row = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    let diag = 0;
    for (let j = 1; j <= b.length; j++) {
      const up = row[j];
      row[j] = a[i - 1] === b[j - 1] ? diag + 1 : Math.max(row[j], row[j - 1]);
      diag = up;
    }
  }
  return row[b.length] / a.length;
}

/** Most of the sentence, in order, and not padded out with much else. */
export function saidRight(target: string, said: string): boolean {
  const extra = words(said).length - words(target).length;
  return overlap(target, said) >= 0.75 && extra <= Math.max(3, words(target).length / 2);
}

/** An answer of their own: a few words of English at least. */
export function answered(said: string): boolean {
  return words(said).length >= 3;
}
