import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { groupMembers, readGroupName } from "@/lib/groups";
import { LIMIT, readJson } from "@/lib/http";
import { createGroup, listGroups } from "@/lib/store";
import { plansOpenTo } from "@/lib/tutorList";

/** Only a tutor on the release list: for anyone else the feature is not there. */
async function tutorSession() {
  const session = await getSession();
  if (session?.role !== "tutor" || !(await plansOpenTo(session.id))) return null;
  return session;
}

export async function GET() {
  const session = await tutorSession();
  if (!session) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return NextResponse.json(await listGroups(session.id));
}

export async function POST(request: Request) {
  const session = await tutorSession();
  if (!session) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const body = await readJson<{ name?: unknown; studentIds?: unknown }>(request, LIMIT.small);
  if (body instanceof Response) return body;
  const name = readGroupName(body.name);
  if (!name) return NextResponse.json({ error: "Give the group a name." }, { status: 400 });
  const members = await groupMembers(session, body.studentIds);
  if ("error" in members) return NextResponse.json({ error: members.error }, { status: members.status });
  const group = await createGroup({
    tutorId: session.id,
    name,
    studentIds: members.students.map((s) => s.id),
  });
  return NextResponse.json(group, { status: 201 });
}
