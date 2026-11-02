import { LIMIT, readJson } from "@/lib/http";
import { NextResponse } from "next/server";
import { studentFor } from "@/lib/access";
import { getSession } from "@/lib/auth";
import { createLesson, listLessons, listStudents } from "@/lib/store";
import {
  DEFAULT_LANGUAGE,
  LESSON_LANGUAGES,
  type LessonMode,
} from "@/lib/types";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  }
  const studentId = new URL(request.url).searchParams.get("studentId");
  if (studentId) {
    if (!(await studentFor(studentId))) {
      return NextResponse.json({ error: "No such student." }, { status: 404 });
    }
    return NextResponse.json(await listLessons(studentId));
  }
  // No student named: only the caller's own students' lessons. This used to
  // fall through to every lesson in the system.
  const lessons = await listLessons();
  if (session.role === "admin") return NextResponse.json(lessons);
  const mine = new Set((await listStudents(session.id)).map((s) => s.id));
  return NextResponse.json(lessons.filter((l) => mine.has(l.studentId)));
}

export async function POST(request: Request) {
  const parsed = await readJson<{
    title?: string;
    mode?: LessonMode;
    studentId?: string;
    /** More than one child: a group lesson. */
    studentIds?: string[];
    language?: string;
    kind?: string;
  }>(request, LIMIT.small);
  if (parsed instanceof Response) return parsed;
  const body = parsed;

  if (!body.title?.trim()) {
    return NextResponse.json({ error: "A title is required." }, { status: 400 });
  }
  if (Array.isArray(body.studentIds) && body.studentIds.length > 1) {
    return createGroupLesson(body.title.trim(), body.studentIds, body.language);
  }
  if (!body.studentId) {
    return NextResponse.json({ error: "A student is required." }, { status: 400 });
  }

  const found = await studentFor(body.studentId);
  if (!found) {
    return NextResponse.json({ error: "No such student." }, { status: 404 });
  }
  const { student } = found;
  if (student.archivedAt) {
    return NextResponse.json(
      { error: "This student is archived. Restore them first." },
      { status: 409 },
    );
  }

  const lesson = await createLesson({
    title: body.title.trim(),
    mode: body.mode === "classroom" ? "classroom" : "online",
    language: LESSON_LANGUAGES.some((l) => l.tag === body.language)
      ? body.language!
      : DEFAULT_LANGUAGE,
    // Derived here, never taken from the client: no consent on file means the
    // student is not recorded, whatever the request asks for.
    capture: student.recordingConsent ? "both" : "tutor",
    studentId: body.studentId,
    // A spoken note about a child nobody has taught yet. Nothing is recorded,
    // so consent does not come into it.
    ...(body.kind === "intro" && { kind: "intro" as const }),
  });

  return NextResponse.json(lesson, { status: 201 });
}

/** A few children around one microphone is the most this is meant to read. */
const MAX_GROUP = 6;

async function createGroupLesson(title: string, studentIds: string[], language?: string) {
  const ids = [...new Set(studentIds)];
  if (ids.length < 2 || ids.length > MAX_GROUP) {
    return NextResponse.json(
      { error: `A group lesson is for 2 to ${MAX_GROUP} students.` },
      { status: 400 },
    );
  }
  const found = await Promise.all(ids.map((id) => studentFor(String(id))));
  const students = found.map((f) => f?.student);
  if (students.some((s) => !s) || new Set(students.map((s) => s?.tutorId)).size !== 1) {
    return NextResponse.json({ error: "No such student." }, { status: 404 });
  }
  if (students.some((s) => s?.archivedAt)) {
    return NextResponse.json(
      { error: "One of these students is archived. Restore them first." },
      { status: 409 },
    );
  }
  const lesson = await createLesson({
    title,
    kind: "group",
    groupStudentIds: ids,
    studentId: ids[0],
    // One microphone in one room: that is the only way several children's
    // voices are heard at all. Online, echo cancellation removes them.
    mode: "classroom",
    language: LESSON_LANGUAGES.some((l) => l.tag === language) ? language! : DEFAULT_LANGUAGE,
    // The transcript holds every child's words, so every parent has to agree.
    capture: students.every((s) => s?.recordingConsent) ? "both" : "tutor",
  });
  return NextResponse.json(lesson, { status: 201 });
}
