import { NextResponse } from "next/server";
import { lessonFor } from "@/lib/access";
import { updateLesson } from "@/lib/store";
import type { Lesson } from "@/lib/types";

type Params = { params: Promise<{ id: string }> };

/**
 * Only what the recorder legitimately produces.
 *
 * A blanket `Partial<Lesson>` let a client set `capture` directly, which walks
 * straight past the rule that capture is derived from the student's consent on
 * the server. Everything not listed here is decided by the server and cannot be
 * moved from outside.
 */
const WRITABLE = [
  "transcript",
  "interruptions",
  "startedAt",
  "endedAt",
  "recordedMs",
  "debrief",
  "debriefTranscript",
] as const;

type Writable = Pick<Lesson, (typeof WRITABLE)[number]>;

function allowed(body: Record<string, unknown>): Partial<Writable> {
  const patch: Record<string, unknown> = {};
  for (const key of WRITABLE) {
    if (key in body) patch[key] = body[key];
  }
  return patch as Partial<Writable>;
}

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const found = await lessonFor(id);
  if (!found) {
    return NextResponse.json({ error: "No such lesson." }, { status: 404 });
  }
  return NextResponse.json(found.lesson);
}

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const found = await lessonFor(id);
  if (!found) {
    return NextResponse.json({ error: "No such lesson." }, { status: 404 });
  }

  const body = (await request.json()) as Record<string, unknown>;
  const patch = allowed(body);

  // The browser's recogniser takes the microphone itself and cannot be handed
  // the gated stream, so in tutor-only mode its transcript contains whatever
  // else was said in the room - including a child whose parents consented to
  // nothing. The audio file is clean because the gate sits before the
  // recorder; the transcript never was. Refuse to store it.
  if (found.lesson.capture === "tutor") delete patch.transcript;

  const lesson = await updateLesson(id, patch);
  return NextResponse.json(lesson);
}
