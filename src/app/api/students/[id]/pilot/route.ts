import { NextResponse } from "next/server";
import { z } from "zod";
import { studentFor } from "@/lib/access";
import { LIMIT, readJson } from "@/lib/http";
import { updateStudent } from "@/lib/store";
import { learningOpenTo } from "@/lib/tutorList";

type Params = { params: Promise<{ id: string }> };

const Body = z.object({
  startedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  weeks: z.number().int().min(1).max(12).optional(),
  note: z.object({ week: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), parent: z.string().max(1000).optional(), tutor: z.string().max(1000).optional() }).optional(),
  end: z.boolean().optional(),
});

/** Start a pilot, change its length, keep a week's notes - or end it. */
export async function PUT(request: Request, { params }: Params) {
  const found = await studentFor((await params).id);
  if (!found || !(await learningOpenTo(found.student.tutorId))) return NextResponse.json({ error: "No such student." }, { status: 404 });
  const raw = await readJson<unknown>(request, LIMIT.small);
  if (raw instanceof Response) return raw;
  const parsed = Body.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "Check the pilot's settings." }, { status: 400 });
  const b = parsed.data;
  const saved = await updateStudent(found.student.id, (s) => {
    if (b.end) return { pilot: undefined };
    const pilot = s.pilot ?? { startedAt: b.startedAt ?? new Date().toISOString().slice(0, 10), weeks: 3, notes: [] };
    const notes = b.note
      ? [...pilot.notes.filter((n) => n.week !== b.note!.week), { week: b.note.week, parent: b.note.parent?.trim() || undefined, tutor: b.note.tutor?.trim() || undefined }].sort((x, y) => x.week.localeCompare(y.week))
      : pilot.notes;
    return { pilot: { ...pilot, ...(b.startedAt && { startedAt: b.startedAt }), ...(b.weeks && { weeks: b.weeks }), notes } };
  });
  return NextResponse.json(saved?.pilot ?? null);
}
