import { getSession, type Session } from "./auth";
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
