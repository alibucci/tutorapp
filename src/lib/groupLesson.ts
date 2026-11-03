import { childPromptIds, type DebriefAnswer, type Lesson, type TranscriptSegment } from "./types";

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

/**
 * This child's answers, as the ordinary questions on their own lesson.
 *
 * The second id of each pair is the earlier debrief, with shared questions and
 * one about each child: one saved before the change must not lose its answers.
 */
export function debriefForChild(lesson: Lesson, studentId: string): DebriefAnswer[] {
  const answer = (id: string, earlier: string) => {
    const find = (key: string) => lesson.debrief.find((a) => a.promptId === key)?.text;
    return find(id) ?? find(earlier) ?? "";
  };
  const ids = childPromptIds(studentId);
  return [
    { promptId: "covered", text: answer(ids.worked, "covered") },
    { promptId: "struggled", text: answer(ids.hard, `c:${studentId}`) },
    { promptId: "next", text: answer(ids.next, "next") },
  ];
}
