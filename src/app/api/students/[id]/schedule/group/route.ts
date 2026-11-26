import { NextResponse } from "next/server";
import { z } from "zod";
import { studentFor } from "@/lib/access";
import { LIMIT, readJson } from "@/lib/http";
import { defaultSchedule } from "@/lib/schedule";
import { getGroup, getLearningPolicy, updateStudent } from "@/lib/store";
import { learningOpenTo } from "@/lib/tutorList";

type Params = { params: Promise<{ id: string }> };

const Body = z.object({ groupId: z.string().max(80) });

/**
 * This learner's schedule for everyone in one of their groups: the days, time,
 * length, limit and delivery - not their history (what was made, when, and
 * why), and not a pause, which is one child's own.
 */
export async function POST(request: Request, { params }: Params) {
  const found = await studentFor((await params).id);
  if (!found?.student.schedule || !(await learningOpenTo(found.student.tutorId))) {
    return NextResponse.json({ error: "Save this child's schedule first." }, { status: 404 });
  }
  const raw = await readJson<unknown>(request, LIMIT.small);
  if (raw instanceof Response) return raw;
  const parsed = Body.safeParse(raw);
  const group = parsed.success ? await getGroup(parsed.data.groupId) : null;
  if (!group || group.tutorId !== found.student.tutorId || !group.studentIds.includes(found.student.id)) {
    return NextResponse.json({ error: "No such group." }, { status: 404 });
  }
  const src = found.student.schedule;
  const policy = await getLearningPolicy();
  const now = new Date().toISOString();
  let changed = 0;
  for (const id of group.studentIds.filter((x) => x !== found.student.id)) {
    const saved = await updateStudent(id, (s) => {
      if (s.archivedAt || s.tutorId !== found.student.tutorId) return null;
      const base = s.schedule ?? defaultSchedule(now, policy);
      return {
        schedule: {
          ...base,
          enabled: src.enabled,
          reviewDays: src.reviewDays,
          lessonDays: src.lessonDays,
          time: src.time,
          timezone: src.timezone,
          minutes: src.minutes,
          maxPerWeek: src.maxPerWeek,
          mode: src.mode,
          updatedAt: now,
        },
      };
    });
    if (saved) changed++;
  }
  return NextResponse.json({ changed });
}
