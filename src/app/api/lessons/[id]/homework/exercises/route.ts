import { NextResponse } from "next/server";
import { lessonFor } from "@/lib/access";
import { buildExercises } from "@/lib/exercises";
import { homeworkDone } from "@/lib/homework";
import { updateLesson } from "@/lib/store";
import type { Lesson, Student } from "@/lib/types";

type Params = { params: Promise<{ id: string }> };

/**
 * Builds in progress, by lesson. A tutor who taps twice, or returns to the
 * page while it is still thinking, joins the one already running rather than
 * paying for a second. In-process, which is right for one server.
 */
const running = new Map<string, Promise<Response>>();

/** Build this lesson's practice games from what the child got wrong. */
export async function POST(_request: Request, { params }: Params) {
  const { id } = await params;
  const found = await lessonFor(id);
  if (!found) {
    return NextResponse.json({ error: "No such lesson." }, { status: 404 });
  }
  if (!found.lesson.summary) {
    return NextResponse.json(
      { error: "The games are built from the summary - write that first." },
      { status: 400 },
    );
  }
  if (homeworkDone(found.lesson.homework)) {
    return NextResponse.json(
      { error: "The homework has already been answered." },
      { status: 409 },
    );
  }

  let job = running.get(id);
  if (!job) {
    job = build(id, found.lesson, found.student).finally(() => running.delete(id));
    running.set(id, job);
  }
  return (await job).clone();
}

async function build(id: string, lesson: Lesson, student: Student): Promise<Response> {
  try {
    const exercises = await buildExercises(lesson, student);
    if (exercises.length === 0) {
      return NextResponse.json(
        { error: "Could not build usable games from this lesson. Try again." },
        { status: 502 },
      );
    }
    const updated = await updateLesson(id, (current) => {
      if (current.homework?.answers) return null;
      const homework = current.homework ?? { focus: current.summary?.homeworkFocus ?? "" };
      return { homework: { ...homework, exercises } };
    });
    return NextResponse.json(updated?.homework);
  } catch (e) {
    console.error("[exercises]", e);
    const message = e instanceof Error ? e.message : "Could not build the games.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
