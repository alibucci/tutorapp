import { gameScore, homeworkDone } from "./homework";
import { getStudent, getTutor } from "./store";
import { canNotify, notify } from "./telegram";
import type { Lesson } from "./types";

/**
 * The two things worth interrupting a tutor for.
 *
 * "Finished" is the one they asked for. "Struggled" is the one that earns the
 * notification: a child who got a third of it right needs the topic explained
 * again, and that is worth knowing before the next lesson rather than after.
 * Anything more and the bot gets muted within a week.
 */
const STRUGGLED_BELOW = 0.5;

/** Fire and forget: a notice must never fail the request that caused it. */
export function noticeHomeworkDone(before: Lesson, after: Lesson | null): void {
  if (!canNotify() || !after) return;
  if (homeworkDone(before.homework) || !homeworkDone(after.homework)) return;
  void send(after).catch((e) => console.error("[notice]", e));
}

async function send(lesson: Lesson): Promise<void> {
  const student = await getStudent(lesson.studentId);
  if (!student) return;
  const tutor = await getTutor(student.tutorId);
  const chatId = tutor?.telegram?.chatId;
  if (!chatId) return;

  const score = gameScore(lesson.homework);
  const struggled = score.total > 0 && score.right / score.total < STRUGGLED_BELOW;

  const lines = [
    struggled
      ? `<b>${student.name}</b> finished the homework, but found it hard.`
      : `<b>${student.name}</b> finished the homework.`,
    lesson.title,
  ];
  if (score.total > 0) {
    lines.push(`${score.right} of ${score.total} right${struggled ? " - worth going over again" : ""}`);
  }
  for (const result of lesson.homework?.results ?? []) {
    lines.push(`· ${result.topic}: ${result.right}/${result.total}`);
  }

  await notify(chatId, lines.join("\n"));
}
