import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { groupFor } from "@/lib/access";
import { groupMembers } from "@/lib/groups";
import { LIMIT, readJson } from "@/lib/http";
import { activePlan } from "@/lib/plans";
import { createGroup, createPlan, getStudent } from "@/lib/store";
import { plansOpenTo } from "@/lib/tutorList";

/**
 * Open the plan for one child, a saved group, or several children picked
 * there and then - who become a saved group, since a plan needs someone to
 * belong to. One active plan each: asking again opens the same one.
 */
export async function POST(request: Request) {
  const session = await getSession();
  if (session?.role !== "tutor" || !(await plansOpenTo(session.id))) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  const body = await readJson<{ studentId?: unknown; groupId?: unknown; studentIds?: unknown }>(
    request,
    LIMIT.small,
  );
  if (body instanceof Response) return body;

  let who: { studentId?: string; groupId?: string };
  if (typeof body.studentId === "string") {
    const student = await getStudent(body.studentId);
    if (!student || student.tutorId !== session.id) {
      return NextResponse.json({ error: "No such student." }, { status: 404 });
    }
    if (student.archivedAt) {
      return NextResponse.json({ error: "This child is archived. Restore them first." }, { status: 409 });
    }
    who = { studentId: student.id };
  } else if (typeof body.groupId === "string") {
    const found = await groupFor(body.groupId);
    if (!found || found.group.archivedAt) {
      return NextResponse.json({ error: "No such group." }, { status: 404 });
    }
    who = { groupId: found.group.id };
  } else {
    const members = await groupMembers(session, body.studentIds);
    if ("error" in members) return NextResponse.json({ error: members.error }, { status: members.status });
    const group = await createGroup({
      tutorId: session.id,
      name: members.students.map((s) => s.name).join(", ").slice(0, 60),
      studentIds: members.students.map((s) => s.id),
    });
    who = { groupId: group.id };
  }

  const existing = await activePlan(session.id, who);
  if (existing) return NextResponse.json(existing);
  const plan = await createPlan({ tutorId: session.id, ...who, durationMinutes: 45 });
  return NextResponse.json(plan, { status: 201 });
}
