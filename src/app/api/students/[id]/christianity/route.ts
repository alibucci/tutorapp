import { NextResponse } from "next/server";
import { studentFor } from "@/lib/access";
import { christianityOpenTo, setModule } from "@/lib/christianity";
import { LIMIT, readJson } from "@/lib/http";
import { startNextAfter, startNextStory } from "@/lib/programmes";

type Params = { params: Promise<{ id: string }> };

/**
 * Switch the module on or off for this learner. On needs `parentAsked`: the
 * tutor ticks that the parent asked for it, and the server stamps the time.
 */
export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const found = await studentFor(id);
  if (!found || !(await christianityOpenTo(found.session))) {
    return NextResponse.json({ error: "No such student." }, { status: 404 });
  }
  const body = await readJson<{ on?: unknown; parentAsked?: unknown }>(request, LIMIT.small);
  if (body instanceof Response) return body;
  if (typeof body.on !== "boolean") {
    return NextResponse.json({ error: "Say on or off." }, { status: 400 });
  }
  const result = await setModule(found.student, body.on, body.parentAsked === true);
  if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });
  // Switched on: the first story (or the one due) is built and sent by itself.
  if (body.on && result.student) startNextAfter(result.student);
  return NextResponse.json(result.student?.modules?.christianity ?? null);
}

/**
 * Build the next story and send it now. The system picks the story; the tutor
 * never picks a number. Stories also go out by themselves (programmes.ts):
 * this is for "now" rather than when the last one is finished.
 */
export async function POST(_request: Request, { params }: Params) {
  const { id } = await params;
  const found = await studentFor(id);
  if (!found || found.student.archivedAt || !(await christianityOpenTo(found.session))) {
    return NextResponse.json({ error: "No such student." }, { status: 404 });
  }
  const result = await startNextStory(found.student);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  if (!result.value) {
    return NextResponse.json(
      { error: "That's all for now: every story in the programme has been done." },
      { status: 409 },
    );
  }
  return NextResponse.json({ id: result.value });
}
