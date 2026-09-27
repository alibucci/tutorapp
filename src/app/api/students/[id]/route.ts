import { NextResponse } from "next/server";
import { studentFor } from "@/lib/access";
import { updateStudent } from "@/lib/store";
import type { Student } from "@/lib/types";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const found = await studentFor(id);
  if (!found) {
    return NextResponse.json({ error: "No such student." }, { status: 404 });
  }
  return NextResponse.json(found.student);
}

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  if (!(await studentFor(id))) {
    return NextResponse.json({ error: "No such student." }, { status: 404 });
  }
  const patch = (await request.json()) as Partial<Student>;
  const student = await updateStudent(id, patch);
  if (!student) {
    return NextResponse.json({ error: "No such student." }, { status: 404 });
  }
  return NextResponse.json(student);
}
