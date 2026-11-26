import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { LIMIT, readJson } from "@/lib/http";
import { validTimezone } from "@/lib/schedule";
import { saveLearningPolicy } from "@/lib/store";

const Day = z.number().int().min(0).max(6);
const Body = z.object({
  template: z.object({
    reviewDays: z.array(Day).max(7),
    time: z.string().regex(/^([01]?\d|2[0-3]):[0-5]\d$/),
    timezone: z.string().max(64).refine(validTimezone),
    minutes: z.union([z.literal(5), z.literal(10), z.literal(15)]),
    maxPerWeek: z.number().int().min(1).max(7),
    mode: z.enum(["auto", "approval", "manual"]),
  }),
  requireApproval: z.boolean(),
  maxPerWeekCap: z.number().int().min(1).max(7),
});

/**
 * The agency's learning policy. Only the admin sets it. A new learner's
 * schedule starts from the template; schedules already set are not changed,
 * except that none goes above the cap and approval, when required, holds.
 */
export async function PUT(request: Request) {
  const session = await getSession();
  if (session?.role !== "admin") return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  const raw = await readJson<unknown>(request, LIMIT.small);
  if (raw instanceof Response) return raw;
  const parsed = Body.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "Check the settings." }, { status: 400 });
  const p = parsed.data;
  const policy = await saveLearningPolicy({
    ...p,
    template: { ...p.template, reviewDays: [...new Set(p.template.reviewDays)].sort(), maxPerWeek: Math.min(p.template.maxPerWeek, p.maxPerWeekCap) },
    updatedAt: new Date().toISOString(),
  });
  return NextResponse.json(policy);
}
