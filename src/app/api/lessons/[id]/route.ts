import { LIMIT, readJson } from "@/lib/http";
import { NextResponse } from "next/server";
import { lessonFor } from "@/lib/access";
import { updateLesson } from "@/lib/store";
import { z } from "zod";

type Params = { params: Promise<{ id: string }> };

/**
 * Only what the recorder legitimately produces.
 *
 * A blanket `Partial<Lesson>` let a client set `capture` directly, which walks
 * straight past the rule that capture is derived from the student's consent on
 * the server. Everything not listed here is decided by the server and cannot be
 * moved from outside.
 */
const Segment = z.object({
  t: z.number().nonnegative(),
  text: z.string().max(4000),
  confidence: z.number().optional(),
  speaker: z.enum(["tutor", "student", "unknown"]).optional(),
  tag: z.string().max(40).optional(),
});

/**
 * The shape of every writable field, checked. A wrong type used to be stored
 * as sent - a debrief saved as a string broke the lesson's page for good.
 */
const Patch = z
  .object({
    transcript: z.array(Segment).max(5000),
    interruptions: z
      .array(
        z.object({
          at: z.string().max(40),
          kind: z.enum(["page-hidden", "track-muted", "track-ended", "audio-suspended"]),
        }),
      )
      .max(200),
    startedAt: z.iso.datetime(),
    endedAt: z.iso.datetime(),
    recordedMs: z.number().nonnegative().max(24 * 60 * 60 * 1000),
    debrief: z
      .array(z.object({ promptId: z.string().max(40), text: z.string().max(4000) }))
      .max(20),
    debriefTranscript: z.array(Segment).max(1000),
  })
  .partial()
  .strip();

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

  const parsed = await readJson<Record<string, unknown>>(request, LIMIT.transcript);
  if (parsed instanceof Response) return parsed;
  const body = parsed;
  const result = Patch.safeParse(body);
  if (!result.success) {
    return NextResponse.json({ error: "That lesson data is not valid." }, { status: 400 });
  }
  const patch = result.data;

  // The browser's recogniser takes the microphone itself and cannot be handed
  // the gated stream, so in tutor-only mode its transcript contains whatever
  // else was said in the room - including a child whose parents consented to
  // nothing. Refuse to store it.
  if (found.lesson.capture === "tutor") delete patch.transcript;

  const lesson = await updateLesson(id, patch);
  return NextResponse.json(lesson);
}
