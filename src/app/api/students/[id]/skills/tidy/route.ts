import { NextResponse } from "next/server";
import { z } from "zod";
import { studentFor } from "@/lib/access";
import { LIMIT, readJson } from "@/lib/http";
import { mergeSkills } from "@/lib/memory";
import { proposeMerges } from "@/lib/skills";
import { updateStudent } from "@/lib/store";
import { learningOpenTo } from "@/lib/tutorList";
import { SKILL_AREAS } from "@/lib/types";

type Params = { params: Promise<{ id: string }> };

async function open(id: string) {
  const found = await studentFor(id);
  if (!found || found.student.archivedAt) return null;
  return (await learningOpenTo(found.student.tutorId)) ? found : null;
}

/** Which skills look like one. Writes nothing. */
export async function POST(_request: Request, { params }: Params) {
  const found = await open((await params).id);
  if (!found) return NextResponse.json({ error: "No such student." }, { status: 404 });
  try {
    return NextResponse.json({ groups: await proposeMerges(found.student) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not read the skills." }, { status: 502 });
  }
}

const Groups = z.object({
  groups: z
    .array(
      z.object({
        keep: z.string().max(80),
        merge: z.array(z.string().max(80)).min(1).max(20),
        name: z.string().max(80).optional(),
        area: z.enum(SKILL_AREAS).optional(),
        parent: z.string().max(80).optional(),
      }),
    )
    .max(30),
});

/** The groups the tutor ticked, merged. Nothing is lost: see mergeSkills. */
export async function PUT(request: Request, { params }: Params) {
  const found = await open((await params).id);
  if (!found) return NextResponse.json({ error: "No such student." }, { status: 404 });
  const raw = await readJson<unknown>(request, LIMIT.medium);
  if (raw instanceof Response) return raw;
  const parsed = Groups.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "Check the groups." }, { status: 400 });
  const saved = await updateStudent(found.student.id, (current) => ({
    skills: parsed.data.groups.reduce(
      (skills, g) => mergeSkills(skills, g.keep, g.merge, { topic: g.name, area: g.area, parent: g.parent }),
      current.skills,
    ),
  }));
  return NextResponse.json({ skills: saved?.skills ?? [] });
}
