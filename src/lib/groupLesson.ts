import { childPromptId, type DebriefAnswer, type Lesson, type TranscriptSegment } from "./types";

/**
 * What one child's own lesson gets from a group lesson: their lines, with the
 * tutor's lines either side so the summary can see what was asked and corrected.
 * Other children's lines stay behind, so their mistakes reach neither this
 * child's summary nor these parents.
 */
export function linesForChild(
  transcript: TranscriptSegment[],
  studentId: string,
): TranscriptSegment[] {
  const out: TranscriptSegment[] = [];
  transcript.forEach((seg, i) => {
    const mine = seg.who === studentId;
    const besideMine =
      seg.who === "tutor" &&
      (transcript[i - 1]?.who === studentId || transcript[i + 1]?.who === studentId);
    if (!mine && !besideMine) return;
    out.push({ t: seg.t, text: seg.text, speaker: mine ? "student" : "tutor" });
  });
  return out;
}

/** The group's debrief, as the ordinary questions on one child's lesson. */
export function debriefForChild(lesson: Lesson, studentId: string): DebriefAnswer[] {
  const answer = (id: string) => lesson.debrief.find((a) => a.promptId === id)?.text ?? "";
  return [
    { promptId: "covered", text: answer("covered") },
    { promptId: "struggled", text: answer(childPromptId(studentId)) },
    { promptId: "next", text: answer("next") },
  ];
}
