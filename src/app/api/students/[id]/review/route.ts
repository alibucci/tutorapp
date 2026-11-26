import { NextResponse } from "next/server";
import { z } from "zod";
import { studentFor } from "@/lib/access";
import { LIMIT, readJson } from "@/lib/http";
import { REVIEW_MINUTES, makeSmartReview, previewReview } from "@/lib/review";
import { learningOpenTo } from "@/lib/tutorList";

type Params = { params: Promise<{ id: string }> };

async function open(id: string) {
  const found = await studentFor(id);
  if (!found || found.student.archivedAt) return null;
  return (await learningOpenTo(found.student.tutorId)) ? found : null;
}

const minutesOf = (v: unknown) => (REVIEW_MINUTES as readonly number[]).includes(Number(v)) ? Number(v) : 10;

/** What a review would practise now, and why. No model call: it is read from the memory. */
export async function GET(request: Request, { params }: Params) {
  const found = await open((await params).id);
  if (!found) return NextResponse.json({ error: "No such student." }, { status: 404 });
  const url = new URL(request.url);
  const { picks, covered } = await previewReview(found.student, {
    minutes: minutesOf(url.searchParams.get("minutes")),
  });
  return NextResponse.json({
    picks: picks.map((p) => ({ id: p.skill.id, topic: p.skill.topic, role: p.role, why: p.why })),
    covered,
  });
}

const Make = z.object({
  minutes: z.number().optional(),
  skillIds: z.array(z.string().max(80)).max(6).optional(),
  comment: z.string().max(300).optional(),
});

/**
 * Make a Smart Review now. The games are built before this answers (half a
 * minute) and kept as a draft: the tutor looks, then sends.
 */
export async function POST(request: Request, { params }: Params) {
  const found = await open((await params).id);
  if (!found) return NextResponse.json({ error: "No such student." }, { status: 404 });
  const raw = await readJson<unknown>(request, LIMIT.small);
  if (raw instanceof Response) return raw;
  const parsed = Make.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "Check the review's settings." }, { status: 400 });
  const made = await makeSmartReview(found.student, {
    minutes: minutesOf(parsed.data.minutes),
    skillIds: parsed.data.skillIds?.length ? parsed.data.skillIds : undefined,
    comment: parsed.data.comment?.trim() || undefined,
    by: "tutor",
  });
  if ("error" in made) return NextResponse.json({ error: made.error }, { status: 409 });
  return NextResponse.json({ id: made.lesson.id, built: made.built }, { status: 201 });
}
