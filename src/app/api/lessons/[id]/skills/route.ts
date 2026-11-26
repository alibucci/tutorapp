import { LIMIT, readJson } from "@/lib/http";
import { NextResponse } from "next/server";
import { lessonFor } from "@/lib/access";
import { updateLesson, updateStudent } from "@/lib/store";
import { applySkillChanges, proposeSkillChanges } from "@/lib/skills";
import type { SkillChange } from "@/lib/types";
import { withUsage } from "@/lib/usage";

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
      changes: await withUsage(
        { purpose: "skills", lessonId: lesson.id, studentId: student.id, tutorId: student.tutorId },
        () => proposeSkillChanges(lesson, student),
      ),
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

  const parsed = await readJson<{ changes: SkillChange[] }>(request, LIMIT.medium);
  if (parsed instanceof Response) return parsed;
  const { changes } = parsed;
  // Under the student's lock: homework results write to the same skills.
  const saved = await updateStudent(student.id, (current) => ({
    skills: applySkillChanges(current.skills, changes ?? [], lesson.id),
  }));
  const skills = saved?.skills ?? [];
  await updateLesson(lesson.id, { skillsAppliedAt: new Date().toISOString() });

  return NextResponse.json({ skills });
}
