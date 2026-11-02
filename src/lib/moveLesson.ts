import { listReports, listStudents } from "./store";
import type { Lesson, ParentReport, Student } from "./types";

/**
 * Moving a lesson to the child it was really with.
 *
 * Starting a lesson under the wrong name is easy and, until now, final. What
 * was said and the tutor's debrief are about the lesson, so they move. What was
 * written from them named the wrong child, so it is cleared and written again.
 * What has already reached a child or a parent cannot be recalled by moving a
 * record, so that is where moving stops.
 */

/** Why this lesson cannot move right now, in words for the tutor; or null. */
export function whyCannotMove(
  lesson: Lesson,
  studentName: string,
  reports: ParentReport[],
): string | null {
  if (lesson.kind === "group" || lesson.groupId) {
    return "This came from a group lesson, so it stays with the child it was made for.";
  }
  // A recorder still running would go on writing a transcript under consent
  // it no longer has.
  if (lesson.kind !== "intro" && lesson.startedAt && !lesson.endedAt) {
    return "The lesson is still recording. Finish it first, then move it.";
  }
  const homework = lesson.homework;
  if (homework?.answers || homework?.results?.length) {
    return `${studentName} has already done this homework, so the lesson stays with them.`;
  }
  if (homework?.sentAt) {
    return `The homework has gone to ${studentName}. Take it back first, then move the lesson.`;
  }
  if (lesson.skillsAppliedAt) {
    return `This lesson's topics are already on ${studentName}'s page, and that cannot be undone.`;
  }
  if (reports.some((r) => r.approvedAt && r.lessonIds.includes(lesson.id))) {
    return `This lesson is in a weekly note ${studentName}'s parents can already read.`;
  }
  return null;
}

/** What the "wrong student?" control needs to show. */
export type MoveOptions = {
  lessonId: string;
  isNote: boolean;
  current: { id: string; name: string };
  others: { id: string; name: string; consent: boolean }[];
  blocked: string | null;
  hasTranscript: boolean;
  /** A summary, games or a parent message exist and would be written again. */
  hasWritten: boolean;
  messageCopied: boolean;
};

export async function moveOptions(lesson: Lesson, student: Student): Promise<MoveOptions> {
  const [students, reports] = await Promise.all([
    listStudents(student.tutorId),
    listReports(student.id),
  ]);
  return {
    lessonId: lesson.id,
    isNote: lesson.kind === "intro",
    current: { id: student.id, name: student.name },
    others: students
      .filter((s) => s.id !== student.id)
      .map((s) => ({ id: s.id, name: s.name, consent: Boolean(s.recordingConsent) })),
    blocked: whyCannotMove(lesson, student.name, reports),
    hasTranscript: lesson.transcript.length > 0,
    hasWritten: Boolean(lesson.summary || lesson.homework || lesson.parentMessage),
    messageCopied: Boolean(lesson.parentMessage?.copiedAt),
  };
}
