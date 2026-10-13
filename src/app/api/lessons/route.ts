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
    language?: string;
    kind?: string;
  }>(request, LIMIT.small);
  if (parsed instanceof Response) return parsed;
  const body = parsed;

  if (!body.title?.trim()) {
    return NextResponse.json({ error: "A title is required." }, { status: 400 });
  }
  if (!body.studentId) {
    return NextResponse.json({ error: "A student is required." }, { status: 400 });
  }

  const found = await studentFor(body.studentId);
  if (!found) {
    return NextResponse.json({ error: "No such student." }, { status: 404 });
  }
  const { student } = found;

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
