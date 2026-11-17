import { NextResponse } from "next/server";
import { lessonFor } from "@/lib/access";
import { StoryNotBuilt, buildStoryHomework, cardById } from "@/lib/christianity";
import { buildGamesOnce } from "@/lib/autoHomework";
import { homeworkDone } from "@/lib/homework";
import { updateLesson } from "@/lib/store";
import type { Lesson, Student } from "@/lib/types";

type Params = { params: Promise<{ id: string }> };

/**
 * Build this lesson's practice games again ("Build different ones").
 *
 * The first build happens by itself (see autoHomework). A tutor who taps
 * twice, or returns while it is still thinking, joins the one running.
 */
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
  // Sent games are rebuilt only until the child starts: what they are in the
  // middle of stays as it is.
  if (found.lesson.homework?.results?.length || found.lesson.homework?.answers) {
    return NextResponse.json(
      { error: "The child has started this homework, so its games stay as they are." },
      { status: 409 },
    );
  }

  // A programme homework is rebuilt from the same story card: text, checks
  // and all. The story stays the one the system picked.
  if (found.lesson.module) return rebuildStory(id, found.lesson, found.student);

  const result = await buildGamesOnce(id, found.lesson, found.student);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(result.value);
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
