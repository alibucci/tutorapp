import { NextResponse } from "next/server";
import { lessonFor } from "@/lib/access";
import { updateLesson, updateStudent } from "@/lib/store";
import { applySkillChanges, proposeSkillChanges } from "@/lib/skills";
import type { SkillChange } from "@/lib/types";

type Params = { params: Promise<{ id: string }> };

/** Ask the model what this lesson changes. Writes nothing. */
export async function POST(_request: Request, { params }: Params) {
  const { id } = await params;
  const found = await lessonFor(id);
  if (!found) {
    return NextResponse.json({ error: "No such lesson." }, { status: 404 });
  }
  const { lesson, student } = found;
  if (!lesson.summary) {
    return NextResponse.json(
      { error: "Generate the lesson summary first." },
      { status: 400 },
    );
  }

  try {
    return NextResponse.json({
      changes: await proposeSkillChanges(lesson, student),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not read the lesson.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

/** The tutor accepted a set of changes - this is what reaches the student. */
export async function PUT(request: Request, { params }: Params) {
  const { id } = await params;
  const found = await lessonFor(id);
  if (!found) {
    return NextResponse.json({ error: "No such lesson." }, { status: 404 });
  }
  const { lesson, student } = found;

  const { changes } = (await request.json()) as { changes: SkillChange[] };
  const skills = applySkillChanges(student.skills, changes ?? [], lesson.id);

  await updateStudent(student.id, { skills });
  await updateLesson(lesson.id, { skillsAppliedAt: new Date().toISOString() });

  return NextResponse.json({ skills });
}
