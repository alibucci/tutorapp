import { NextResponse } from "next/server";
import { lessonFor } from "@/lib/access";
import { forgetMistakes, rememberMistakes } from "@/lib/redo";
import { getStudent, updateLesson } from "@/lib/store";

type Params = { params: Promise<{ id: string }> };

/**
 * "Practise these next time": keep this homework's wrong rounds on the
 * learner, for the next homework built for them.
 */
export async function POST(_request: Request, { params }: Params) {
  const { id } = await params;
  const found = await lessonFor(id);
  if (!found) return NextResponse.json({ error: "No such lesson." }, { status: 404 });
  if (found.lesson.module) {
    return NextResponse.json({ error: "Stories follow their programme; nothing to carry." }, { status: 400 });
  }
  const items = await rememberMistakes(found.student, found.lesson);
  if (!items.length) {
    return NextResponse.json({ error: "Nothing was got wrong here." }, { status: 400 });
  }
  await updateLesson(id, (current) =>
    current.homework ? { homework: { ...current.homework, carriedAt: new Date().toISOString() } } : null,
  );
  return NextResponse.json({ kept: items.length });
}

/** Take them back, while no homework has used them yet. */
export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  const found = await lessonFor(id);
  if (!found) return NextResponse.json({ error: "No such lesson." }, { status: 404 });
  await forgetMistakes(found.student.id, id);
  // Still with the learner means a homework already used them: that stays true.
  const left = (await getStudent(found.student.id))?.redo?.some((r) => r.fromLesson === id);
  if (!left) {
    await updateLesson(id, (current) => {
      if (!current.homework?.carriedAt) return null;
      const homework = { ...current.homework };
      delete homework.carriedAt;
      return { homework };
    });
  }
  return NextResponse.json({ ok: true });
}
