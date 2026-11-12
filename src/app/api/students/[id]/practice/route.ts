import { NextResponse } from "next/server";
import { studentFor } from "@/lib/access";
import { buildExercises } from "@/lib/exercises";
import { LIMIT, readJson } from "@/lib/http";
import { createLesson, updateLesson } from "@/lib/store";
import { DEFAULT_LANGUAGE } from "@/lib/types";

type Params = { params: Promise<{ id: string }> };

const MIN = 4;
const MAX = 300;

/**
 * Extra homework from the tutor's own words: "adding and taking away up to
 * 20". It lives as a lesson with nothing recorded, so sending it, the
 * learner's screen, the scores and the notices all work as for any homework.
 *
 * The games are built straight away, which takes half a minute. If that
 * fails the homework is still there, and the tutor builds them again from
 * its page.
 */
export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const found = await studentFor(id);
  if (!found || found.student.archivedAt) {
    return NextResponse.json({ error: "No such student." }, { status: 404 });
  }

  const body = await readJson<{ request?: unknown }>(request, LIMIT.small);
  if (body instanceof Response) return body;
  const asked = typeof body.request === "string" ? body.request.trim().replace(/\s+/g, " ") : "";
  if (asked.length < MIN || asked.length > MAX) {
    return NextResponse.json(
      { error: `Say what to practise in a few words (up to ${MAX} characters).` },
      { status: 400 },
    );
  }

  const title = asked.length <= 60 ? asked : `${asked.slice(0, 59)}…`;
  const now = new Date().toISOString();
  const lesson = await createLesson({
    title: title[0].toUpperCase() + title.slice(1),
    kind: "practice",
    request: asked,
    studentId: found.student.id,
    mode: "online",
    // Nothing is recorded; the field only has to say so.
    capture: "tutor",
    language: DEFAULT_LANGUAGE,
    startedAt: now,
    endedAt: now,
  });

  try {
    const exercises = await buildExercises(lesson, found.student);
    if (exercises.length === 0) throw new Error("No usable games.");
    await updateLesson(lesson.id, { homework: { focus: asked, exercises } });
    return NextResponse.json({ id: lesson.id, built: true });
  } catch (e) {
    console.error("[practice]", e);
    await updateLesson(lesson.id, { homework: { focus: asked } });
    return NextResponse.json({ id: lesson.id, built: false });
  }
}
