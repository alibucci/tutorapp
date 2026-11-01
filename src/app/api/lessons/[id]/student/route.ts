import { NextResponse } from "next/server";
import { lessonFor, studentFor } from "@/lib/access";
import { LIMIT, readJson } from "@/lib/http";
import { whyCannotMove } from "@/lib/moveLesson";
import { deleteImage, deleteReport, listReports, updateLesson } from "@/lib/store";

type Params = { params: Promise<{ id: string }> };

/** The lesson was really with another of this tutor's students. */
export async function PUT(request: Request, { params }: Params) {
  const { id } = await params;
  const found = await lessonFor(id);
  if (!found) {
    return NextResponse.json({ error: "No such lesson." }, { status: 404 });
  }

  const parsed = await readJson<{ studentId?: string }>(request, LIMIT.small);
  if (parsed instanceof Response) return parsed;
  if (!parsed.studentId) {
    return NextResponse.json({ error: "A student is required." }, { status: 400 });
  }

  const target = await studentFor(parsed.studentId);
  // Only among one tutor's own children, even for the superadmin.
  if (!target || target.student.tutorId !== found.student.tutorId) {
    return NextResponse.json({ error: "No such student." }, { status: 404 });
  }
  if (target.student.archivedAt) {
    return NextResponse.json(
      { error: "This student is archived. Restore them first." },
      { status: 409 },
    );
  }
  if (target.student.id === found.student.id) {
    return NextResponse.json(found.lesson);
  }

  const reports = await listReports(found.student.id);
  const blocked = whyCannotMove(found.lesson, found.student.name, reports);
  if (blocked) {
    return NextResponse.json({ error: blocked }, { status: 409 });
  }

  const consent = Boolean(target.student.recordingConsent);
  const moved = await updateLesson(id, (current) => {
    // Decided again under the lock: homework may have gone out since.
    if (whyCannotMove(current, found.student.name, reports)) return null;
    return {
      studentId: target.student.id,
      // A recording made under one child's consent is not covered by another's
      // absence of it: without consent the transcript goes, the same rule as
      // for a lesson created that way. Consent cannot add a voice that was
      // never captured, so a lesson already recorded stays as it was.
      capture: !consent ? ("tutor" as const) : current.startedAt ? current.capture : ("both" as const),
      transcript: consent ? current.transcript : [],
      // All written with the other child's name and history.
      summary: undefined,
      parentMessage: undefined,
      homework: undefined,
    };
  });
  if (moved?.studentId !== target.student.id) {
    return NextResponse.json(
      { error: "This lesson changed in the meantime. Reload and try again." },
      { status: 409 },
    );
  }

  await deleteImage(found.lesson.homework?.imageFile);
  await Promise.all((found.lesson.homework?.candidates ?? []).map((name) => deleteImage(name)));
  // A draft weekly note built from this lesson would tell the wrong parents
  // about it. Nobody has seen a draft; it is made again in one tap.
  await Promise.all(
    reports
      .filter((r) => !r.approvedAt && r.lessonIds.includes(id))
      .map((r) => deleteReport(r.id)),
  );

  return NextResponse.json(moved);
}
