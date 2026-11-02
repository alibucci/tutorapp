import { NextResponse } from "next/server";
import { lessonFor } from "@/lib/access";
import { labelGroupLines } from "@/lib/diarize";
import { getStudent, updateLesson } from "@/lib/store";
import type { Student } from "@/lib/types";

type Params = { params: Promise<{ id: string }> };

/** Suggest who said each line. The tutor checks it on the next screen. */
export async function POST(_request: Request, { params }: Params) {
  const { id } = await params;
  const found = await lessonFor(id);
  if (!found || found.lesson.kind !== "group") {
    return NextResponse.json({ error: "No such group lesson." }, { status: 404 });
  }
  const { lesson } = found;
  if (lesson.groupLessonIds) return NextResponse.json(lesson);

  const students = (
    await Promise.all((lesson.groupStudentIds ?? []).map((sid) => getStudent(sid)))
  ).filter((s): s is Student => Boolean(s));

  try {
    const transcript = await labelGroupLines(lesson.transcript, students);
    return NextResponse.json(await updateLesson(id, { transcript }));
  } catch (e) {
    console.error("[group labels]", e);
    const message = e instanceof Error ? e.message : "Could not read the lesson.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
