import { NextResponse } from "next/server";
import { lessonFor } from "@/lib/access";
import { updateLesson } from "@/lib/store";
import type { Lesson } from "@/lib/types";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const found = await lessonFor(id);
  if (!found) {
    return NextResponse.json({ error: "No such lesson." }, { status: 404 });
  }
  const { lesson } = found;
  return NextResponse.json(lesson);
}

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const patch = (await request.json()) as Partial<Lesson>;
  const lesson = await updateLesson(id, patch);
  if (!lesson) {
    return NextResponse.json({ error: "No such lesson." }, { status: 404 });
  }
  return NextResponse.json(lesson);
}
