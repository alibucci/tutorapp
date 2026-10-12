import { getFamilySession, getSession, type Session } from "./auth";
import { homeworkDone } from "./homework";
import { getLesson, getStudent } from "./store";
import type { Lesson, Student } from "./types";

/**
 * Authorisation lives next to the data, not in proxy.ts.
 *
 * Every route that reads or writes one student's material goes through here, so
 * a tutor cannot reach another tutor's student by guessing an id.
 */

export function owns(session: Session, student: Student): boolean {
  return session.role === "admin" || student.tutorId === session.id;
}

export async function studentFor(
  id: string,
): Promise<{ session: Session; student: Student } | null> {
  const session = await getSession();
  if (!session) return null;
  const student = await getStudent(id);
  if (!student || !owns(session, student)) return null;
  return { session, student };
}

export async function lessonFor(
  id: string,
): Promise<{ session: Session; lesson: Lesson; student: Student } | null> {
  const session = await getSession();
  if (!session) return null;
  const lesson = await getLesson(id);
  if (!lesson) return null;
  const student = await getStudent(lesson.studentId);
  if (!student || !owns(session, student)) return null;
  return { session, lesson, student };
}

/**
 * Who may see a lesson's homework: the tutor who owns the student, the
 * family signed in, or anyone holding the child's private link. The parent's
 * private link sees homework only once it is handed in - as history, never as
 * a task it could answer.
 */
export async function homeworkFor(
  lessonId: string,
  key: string | null,
): Promise<{ lesson: Lesson; student: Student; tutor: boolean } | null> {
  const lesson = await getLesson(lessonId);
  if (!lesson) return null;
  const student = await getStudent(lesson.studentId);
  if (!student) return null;

  const session = await getSession();
  if (session && owns(session, student)) return { lesson, student, tutor: true };

  const family = await getFamilySession();
  const child =
    family?.id === student.id ||
    (key !== null && key.length > 0 && key === student.studentKey);
  // The child sees homework only once the tutor has sent it.
  if (child && lesson.homework?.sentAt) return { lesson, student, tutor: false };
  const parent = key !== null && key.length > 0 && key === student.parentKey;
  if (parent && homeworkDone(lesson.homework)) return { lesson, student, tutor: false };
  return null;
}
