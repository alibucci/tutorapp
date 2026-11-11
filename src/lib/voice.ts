import { ADULT_AGE } from "./profile";
import type { Pronounced, Student } from "./types";

/**
 * Pronunciation scoring: the parts both the server and the page need.
 *
 * Who may have it is narrow on purpose. A voice is sensitive data, and the
 * recording leaves mainland China for the scoring service in Hong Kong, so
 * this is for adults who say yes themselves - never a child, never on a
 * tutor's say-so.
 */

/** Bump when the consent wording changes in substance: everyone is asked again. */
export const VOICE_CONSENT_VERSION = 1;

/** A line counts as said well from here. Learners, not native speakers. */
export const VOICE_PASS = 70;

/** The longest line we score. Longer is a paragraph, not a line to repeat. */
export const VOICE_MAX_SECONDS = 20;

/** Old enough to agree for themselves. An age nobody entered is not. */
export function mayScoreVoice(student: Pick<Student, "profile">): boolean {
  return (student.profile?.age ?? 0) >= ADULT_AGE;
}

export function hasVoiceConsent(student: Pick<Student, "profile" | "voiceConsent">): boolean {
  return (
    mayScoreVoice(student) && student.voiceConsent?.version === VOICE_CONSENT_VERSION
  );
}

/** The words to work on, worst first, short enough for a list. */
export function weakWords(result: Pronounced, most = 4): string[] {
  return result.words
    .filter((w) => w.missed || w.score < VOICE_PASS)
    .sort((a, b) => a.score - b.score)
    .slice(0, most)
    .map((w) => {
      const word = w.word.replace(/[^\p{L}\p{N}'-]/gu, "");
      if (w.missed) return `${word} (missed)`;
      const swap = w.sounds?.find((s) => s.heard);
      return swap ? `${word} (/${swap.sound}/ sounded like /${swap.heard}/)` : word;
    });
}

/** One line for the tutor's list of answers. */
export function voiceSummary(result: Pronounced): string {
  const weak = weakWords(result);
  return `Pronunciation ${result.overall}/100${weak.length ? ` - work on: ${weak.join(", ")}` : ""}`;
}
