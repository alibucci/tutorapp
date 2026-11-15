import { NextResponse } from "next/server";
import { lessonFor } from "@/lib/access";
import { StoryNotBuilt, buildStoryHomework, cardById } from "@/lib/christianity";
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
  // Extra homework is built from the tutor's request, not a summary.
  if (!found.lesson.summary && found.lesson.kind !== "practice") {
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

  // By student too, as for the summary: a moved lesson gets its own games.
  const key = `${id}:${found.student.id}`;
  let job = running.get(key);
  if (!job) {
    job = build(id, found.lesson, found.student).finally(() => running.delete(key));
    running.set(key, job);
  }
  return (await job).clone();
}

async function build(id: string, lesson: Lesson, student: Student): Promise<Response> {
  // A programme homework is rebuilt from the same story card: text, checks
  // and all. The story stays the one the system picked.
  if (lesson.module) return rebuildStory(id, lesson, student);
  try {
    const exercises = await buildExercises(lesson, student);
    if (exercises.length === 0) {
      return NextResponse.json(
        { error: "Could not build usable games from this lesson. Try again." },
        { status: 502 },
      );
    }
    const updated = await updateLesson(id, (current) => {
      if (current.homework?.answers || current.studentId !== student.id) return null;
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

async function rebuildStory(id: string, lesson: Lesson, student: Student): Promise<Response> {
  const card = cardById(lesson.module?.storyId);
  if (!card) return NextResponse.json({ error: "That story is no longer in the programme." }, { status: 410 });
  if (lesson.homework?.sentAt) {
    return NextResponse.json({ error: "It has been sent. Take it back first to write it again." }, { status: 409 });
  }
  try {
    const built = await buildStoryHomework(student, card, cardById(lesson.module?.reviewOf));
    const updated = await updateLesson(id, (current) => {
      if (current.homework?.sentAt || current.studentId !== student.id) return null;
      return {
        homework: { ...current.homework, ...built.homework },
        parentMessage: current.parentMessage?.editedAt ? current.parentMessage : built.parentMessage,
      };
    });
    return NextResponse.json(updated?.homework);
  } catch (e) {
    console.error("[christianity] rebuild", e);
    const message = e instanceof StoryNotBuilt ? e.message : "Could not build it. Try again.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
