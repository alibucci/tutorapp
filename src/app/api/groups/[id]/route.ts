import { NextResponse } from "next/server";
import { groupFor } from "@/lib/access";
import { groupMembers, readGroupName } from "@/lib/groups";
import { LIMIT, readJson } from "@/lib/http";
import { updateGroup } from "@/lib/store";
import { plansOpenTo } from "@/lib/tutorList";
import type { StudentGroup } from "@/lib/types";

type Params = { params: Promise<{ id: string }> };

async function found(id: string) {
  const result = await groupFor(id);
  if (!result || !(await plansOpenTo(result.session.id))) return null;
  return result;
}

export async function GET(_request: Request, { params }: Params) {
  const result = await found((await params).id);
  if (!result) return NextResponse.json({ error: "No such group." }, { status: 404 });
  return NextResponse.json(result.group);
}

/** Rename, change who is in it, archive or restore. */
export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const result = await found(id);
  if (!result) return NextResponse.json({ error: "No such group." }, { status: 404 });

  const body = await readJson<{ name?: unknown; studentIds?: unknown; archived?: unknown }>(
    request,
    LIMIT.small,
  );
  if (body instanceof Response) return body;

  const patch: Partial<StudentGroup> = {};
  if (body.name !== undefined) {
    const name = readGroupName(body.name);
    if (!name) return NextResponse.json({ error: "Give the group a name." }, { status: 400 });
    patch.name = name;
  }
  if (body.studentIds !== undefined) {
    const members = await groupMembers(result.session, body.studentIds);
    if ("error" in members) return NextResponse.json({ error: members.error }, { status: members.status });
    if (members.students.some((s) => s.tutorId !== result.group.tutorId)) {
      return NextResponse.json({ error: "No such student." }, { status: 404 });
    }
    patch.studentIds = members.students.map((s) => s.id);
  }
  if (typeof body.archived === "boolean") {
    patch.archivedAt = body.archived ? new Date().toISOString() : undefined;
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
  }
  return NextResponse.json(await updateGroup(id, patch));
}
