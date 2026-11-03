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
    effort: "low",
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

const GROUP_SYSTEM = `You label who said each line of a small group English lesson: one
tutor and a few children around one microphone. The transcript does not say who
is speaking, and a line may be misheard.

What settles it:
- The tutor calls a child by name, often just a first name or a nickname. The
  lines straight after that usually belong to that child, until the tutor speaks
  again.
- The tutor asks, explains, corrects and praises. "Okay, good" after an answer is
  the tutor. Children answer, usually more briefly.
- With nobody called, a child's answer could be anyone's: say "unknown".

Label every line with one of the ids you are given, "tutor" or "unknown".
"unknown" is much better than a guess: a wrong name puts one child's mistake on
another child's report to their parents.

Return one entry per line, using the index given.`;

/**
 * Who said each line of a group lesson, from the names the tutor calls. Only a
 * suggestion: the tutor checks it before anything is made from it.
 */
export async function labelGroupLines(
  segments: TranscriptSegment[],
  students: { id: string; name: string }[],
): Promise<TranscriptSegment[]> {
  if (!segments.length) return segments;
  // Short ids, so a name the recogniser misheard cannot turn into a new person.
  const ids = students.map((s, i) => ({ short: `c${i + 1}`, ...s }));
  const schema = z.object({
    labels: z.array(z.object({ index: z.number(), who: z.string() })),
  });

  const byShort = new Map<string, string>(ids.map((s) => [s.short, s.id]));
  byShort.set("tutor", "tutor");

  const ask = async () => {
    const parsed = await complete({
      system: GROUP_SYSTEM,
      user: [
        "The children:",
        ...ids.map((s) => `${s.short} = ${s.name}`),
        "",
        "The lines:",
        ...segments.map((seg, i) => `${i}: ${seg.text}`),
      ].join("\n"),
      schema,
      schemaName: "GroupSpeakerLabels",
      model: MODEL_FAST,
      effort: "low",
      // One short entry per line, and an hour of a lesson is many lines.
      maxTokens: 24000,
    });
    const byIndex = new Map(parsed.labels.map((l) => [l.index, byShort.get(l.who) ?? "unknown"]));
    const unknown = segments.filter((_, i) => (byIndex.get(i) ?? "unknown") === "unknown").length;
    return { byIndex, unknown, returned: parsed.labels.length };
  };

  // Now and then a whole answer comes back mostly unlabelled from a lesson it
  // reads perfectly the next time, leaving a child with no lines. Worth one more
  // go; the numbers go to the log so the cause can be seen. No lesson text.
  let result = await ask();
  if (result.unknown > segments.length / 3) {
    const first = result;
    console.warn(
      `[group labels] ${first.unknown}/${segments.length} unknown, ${first.returned} labels returned; asking again`,
    );
    const second = await ask();
    result = second.unknown < first.unknown ? second : first;
  }
  const { byIndex } = result;
  return segments.map((seg, i) => ({ ...seg, who: byIndex.get(i) ?? "unknown" }));
}
