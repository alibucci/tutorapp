import { NextResponse } from "next/server";
import { studentFor } from "@/lib/access";
import { writeBrief } from "@/lib/brief";
import { listLessons, updateStudent } from "@/lib/store";
import { learningOpenTo } from "@/lib/tutorList";

type Params = { params: Promise<{ id: string }> };

/** Write the "before the next lesson" brief now (half a minute) and keep it. */
export async function POST(_request: Request, { params }: Params) {
  const found = await studentFor((await params).id);
  if (!found || found.student.archivedAt || !(await learningOpenTo(found.student.tutorId))) {
    return NextResponse.json({ error: "No such student." }, { status: 404 });
  }
  try {
    const brief = await writeBrief(found.student, await listLessons(found.student.id));
    await updateStudent(found.student.id, { brief });
    return NextResponse.json(brief);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "The brief could not be written." }, { status: 502 });
  }
}
