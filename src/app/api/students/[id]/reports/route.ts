import { NextResponse } from "next/server";
import { studentFor } from "@/lib/access";
import { listLessons, listReports, saveReport } from "@/lib/store";
import {
  draftParentReport,
  lessonsInWeek,
  weekBounds,
} from "@/lib/parentReport";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  if (!(await studentFor(id))) {
    return NextResponse.json({ error: "No such student." }, { status: 404 });
  }
  return NextResponse.json(await listReports(id));
}

/** Draft this week's note. Stays unapproved until the tutor says otherwise. */
export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const found = await studentFor(id);
  if (!found) {
    return NextResponse.json({ error: "No such student." }, { status: 404 });
  }
  const { student } = found;

  const body = (await request.json().catch(() => ({}))) as { week?: string };
  const { start, end } = weekBounds(body.week ? new Date(body.week) : new Date());

  const lessons = lessonsInWeek(await listLessons(id), start, end);
  if (!lessons.length) {
    return NextResponse.json(
      { error: "No lessons in that week." },
      { status: 400 },
    );
  }

  try {
    const report = await draftParentReport(student, lessons, start, end);
    return NextResponse.json(await saveReport(report), { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not draft the report.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
