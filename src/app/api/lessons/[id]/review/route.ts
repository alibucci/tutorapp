import { NextResponse } from "next/server";
import { z } from "zod";
import { lessonFor } from "@/lib/access";
import { LIMIT, readJson } from "@/lib/http";
import { updateLesson } from "@/lib/store";

type Params = { params: Promise<{ id: string }> };

const Body = z.object({ state: z.enum(["skipped", "archived"]).nullable(), reason: z.string().max(200).optional() });

/**
 * The tutor sets a Smart Review aside - skipped, or archived when a new
 * lesson made it stale - or brings it back. Set aside, it no longer holds
 * the schedule's next one back. Answers already given are kept.
 */
export async function PATCH(request: Request, { params }: Params) {
  const found = await lessonFor((await params).id);
  if (!found?.lesson.review) return NextResponse.json({ error: "No such Smart Review." }, { status: 404 });
  const raw = await readJson<unknown>(request, LIMIT.small);
  if (raw instanceof Response) return raw;
  const parsed = Body.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "Check the request." }, { status: 400 });
  const { state, reason } = parsed.data;
  const saved = await updateLesson(found.lesson.id, (l) => {
    if (!l.review) return null;
    const review = { ...l.review };
    if (state) {
      review.state = state;
      review.stateAt = new Date().toISOString();
      if (reason) review.stateReason = reason;
    } else {
      delete review.state;
      delete review.stateAt;
      delete review.stateReason;
    }
    return { review };
  });
  return NextResponse.json(saved?.review ?? null);
}
