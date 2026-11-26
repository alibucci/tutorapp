import { NextResponse } from "next/server";
import { lessonFor } from "@/lib/access";
import { autoHomeworkAfter, summarizeOnce } from "@/lib/autoHomework";
import { withUsage } from "@/lib/usage";

type Params = { params: Promise<{ id: string }> };

/**
 * Write (or rewrite) the summary and the parent message.
 *
 * A generation keeps running when the tutor locks the phone, and a tutor who
 * comes back before it finishes joins it rather than starting another (see
 * summarizeOnce). Once there is a summary, the homework is built and sent by
 * itself if it has not gone yet.
 */
export async function POST(_request: Request, { params }: Params) {
  const { id } = await params;
  const found = await lessonFor(id);
  if (!found) {
    return NextResponse.json({ error: "No such lesson." }, { status: 404 });
  }
  // A summary already there is being paid for a second time.
  const usage = {
    purpose: found.lesson.summary ? "regeneration" : "lesson_summary",
    lessonId: id,
    studentId: found.student.id,
    tutorId: found.student.tutorId,
  } as const;
  const result = await withUsage(usage, () => summarizeOnce(id, found.lesson, found.student));
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  autoHomeworkAfter(id);
  return NextResponse.json(result.value);
}
