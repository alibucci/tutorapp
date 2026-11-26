import { NextResponse } from "next/server";
import { z } from "zod";
import { studentFor } from "@/lib/access";
import { LIMIT, readJson } from "@/lib/http";
import { REVIEW_MINUTES } from "@/lib/review";
import { defaultSchedule, validTimezone } from "@/lib/schedule";
import { getLearningPolicy, updateStudent } from "@/lib/store";
import { learningOpenTo } from "@/lib/tutorList";

type Params = { params: Promise<{ id: string }> };

const Day = z.number().int().min(0).max(6);
const Body = z.object({
  enabled: z.boolean().optional(),
  reviewDays: z.array(Day).max(7).optional(),
  lessonDays: z.array(Day).max(7).optional(),
  time: z.string().regex(/^([01]?\d|2[0-3]):[0-5]\d$/).optional(),
  timezone: z.string().max(64).refine(validTimezone, "Unknown time zone").optional(),
  minutes: z.number().refine((m) => (REVIEW_MINUTES as readonly number[]).includes(m)).optional(),
  maxPerWeek: z.number().int().min(1).max(7).optional(),
  mode: z.enum(["auto", "approval", "manual"]).optional(),
  paused: z.boolean().optional(),
});

/**
 * Change the learner's schedule. Anything already sent stays as it is; the
 * next slots follow the new settings. The slot already dealt with is kept,
 * so changing the time never makes the same day's review twice.
 */
export async function PUT(request: Request, { params }: Params) {
  const found = await studentFor((await params).id);
  if (!found || found.student.archivedAt || !(await learningOpenTo(found.student.tutorId))) {
    return NextResponse.json({ error: "No such student." }, { status: 404 });
  }
  const raw = await readJson<unknown>(request, LIMIT.small);
  if (raw instanceof Response) return raw;
  const parsed = Body.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "Check the schedule's settings." }, { status: 400 });
  const { paused, ...b } = parsed.data;
  const now = new Date().toISOString();
  const policy = await getLearningPolicy();
  // Within the agency's limit: a tutor personalises, the admin sets the ceiling.
  if (policy && b.maxPerWeek) b.maxPerWeek = Math.min(b.maxPerWeek, policy.maxPerWeekCap);
  const saved = await updateStudent(found.student.id, (s) => {
    const current = s.schedule ?? defaultSchedule(now, policy);
    const next = {
      ...current,
      ...b,
      ...(b.reviewDays && { reviewDays: [...new Set(b.reviewDays)].sort() }),
      ...(b.lessonDays && { lessonDays: [...new Set(b.lessonDays)].sort() }),
      updatedAt: now,
    };
    if (paused === true) next.pausedAt = current.pausedAt ?? now;
    if (paused === false) delete next.pausedAt;
    return { schedule: next };
  });
  return NextResponse.json(saved?.schedule ?? null);
}
