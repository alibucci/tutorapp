import { z } from "zod";
import { MODEL_FAST, complete } from "./llm";
import type { Speaker, TranscriptSegment } from "./types";

const LabelsSchema = z.object({
  labels: z.array(
    z.object({
      index: z.number().describe("The line number as given"),
      speaker: z.enum(["tutor", "student", "unknown"]),
    }),
  ),
});

const SYSTEM = `You label who said each line of a one-to-one tutoring lesson.

There are exactly two people in the room: the tutor and one student. One
microphone recorded both, so the transcript does not say who is speaking.

Signals that usually settle it:
- The tutor asks questions, explains, corrects, prompts and praises.
- The student answers, usually more briefly, and is the one being corrected.
- A line that answers the previous line's question belongs to the other speaker.
- Speakers normally alternate, but either may say several lines in a row.

Label every line. Use "unknown" when the line genuinely could be either - a bare
"yes", a fragment, a misrecognition. "unknown" is much better than a coin flip,
because everything downstream treats these labels as fact.

Return one entry per line, using the index given.`;

/**
 * Attach a speaker to each transcript line.
 *
 * Deliberately text-only. In a closed room with two people the dialogue itself
 * usually makes the speaker obvious, and this needs no model on the device and
 * no voice enrolment. If it proves unreliable on real lessons, an acoustic
 * speaker check belongs in the worklet - not here.
 */
export async function labelSpeakers(
  segments: TranscriptSegment[],
): Promise<TranscriptSegment[]> {
  if (!segments.length) return segments;

  const numbered = segments
    .map((seg, i) => `${i}: ${seg.text}`)
    .join("\n");

  // A mechanical pass over a long transcript - the cheap model is enough.
  const parsed = await complete({
    system: SYSTEM,
    user: numbered,
    schema: LabelsSchema,
    schemaName: "SpeakerLabels",
    model: MODEL_FAST,
  });

  // Merge by index: a short, long or reordered reply cannot corrupt the
  // transcript, it only leaves lines unlabelled.
  const byIndex = new Map<number, Speaker>(
    parsed.labels.map((l) => [l.index, l.speaker]),
  );
  return segments.map((seg, i) => ({
    ...seg,
    speaker: byIndex.get(i) ?? "unknown",
  }));
}

/**
 * Share of spoken words that came from the student.
 *
 * Counted in words rather than seconds: segment durations are not recorded, and
 * word count is a steadier proxy for "who is doing the work" anyway.
 */
export function studentWordShare(
  segments: TranscriptSegment[],
): number | undefined {
  let tutor = 0;
  let student = 0;
  for (const seg of segments) {
    const words = seg.text.trim().split(/\s+/).filter(Boolean).length;
    if (seg.speaker === "tutor") tutor += words;
    else if (seg.speaker === "student") student += words;
  }
  const total = tutor + student;
  return total === 0 ? undefined : student / total;
}
