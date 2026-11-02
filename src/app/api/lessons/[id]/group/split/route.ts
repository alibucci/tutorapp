import { NextResponse } from "next/server";
import { lessonFor } from "@/lib/access";
import { debriefForChild, linesForChild } from "@/lib/groupLesson";
import { LIMIT, readJson } from "@/lib/http";
import { createLesson, getStudent, updateLesson } from "@/lib/store";

type Params = { params: Promise<{ id: string }> };

/** Splits in progress, so a double tap cannot make every child two lessons. */
const running = new Set<string>();

/**
 * The tutor has checked who said what: make each child's own lesson. Everything
 * after this is the ordinary one-to-one path, reviewed and sent per child.
 */
export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const found = await lessonFor(id);
  if (!found || found.lesson.kind !== "group") {
    return NextResponse.json({ error: "No such group lesson." }, { status: 404 });
  }
  const { lesson } = found;
  if (lesson.groupLessonIds) {
    return NextResponse.json({ error: "This lesson is already split." }, { status: 409 });
  }
  if (!lesson.endedAt) {
    return NextResponse.json({ error: "Finish the lesson first." }, { status: 409 });
  }
  if (lesson.debrief.length === 0) {
    return NextResponse.json({ error: "Record the debrief first." }, { status: 409 });
  }

  const parsed = await readJson<{ who?: unknown }>(request, LIMIT.transcript);
  if (parsed instanceof Response) return parsed;

  const studentIds = lesson.groupStudentIds ?? [];
  const allowed = new Set([...studentIds, "tutor", "unknown"]);
  const who = Array.isArray(parsed.who) ? parsed.who : [];
  if (
    lesson.transcript.length > 0 &&
    (who.length !== lesson.transcript.length ||
      who.some((w) => typeof w !== "string" || !allowed.has(w)))
  ) {
    return NextResponse.json(
      { error: "Those labels do not match this lesson. Reload and try again." },
      { status: 400 },
    );
  }

  if (running.has(id)) {
    return NextResponse.json({ error: "Already on it." }, { status: 409 });
  }
  running.add(id);
  try {
    const transcript = lesson.transcript.map((seg, i) => ({ ...seg, who: who[i] as string }));
    const made = [];
    for (const studentId of studentIds) {
      const student = await getStudent(studentId);
      // Archived since the lesson began: nobody is there to send it to.
      if (!student || student.archivedAt) continue;
      made.push(
        await createLesson({
          title: lesson.title,
          mode: lesson.mode,
          language: lesson.language,
          capture: lesson.capture,
          studentId,
          groupId: lesson.id,
          startedAt: lesson.startedAt,
          endedAt: lesson.endedAt,
          recordedMs: lesson.recordedMs,
          transcript: linesForChild(transcript, studentId),
          debrief: debriefForChild(lesson, studentId),
        }),
      );
    }
    const updated = await updateLesson(id, {
      transcript,
      groupLessonIds: made.map((l) => l.id),
    });
    return NextResponse.json({ lesson: updated, lessons: made });
  } finally {
    running.delete(id);
  }
}
