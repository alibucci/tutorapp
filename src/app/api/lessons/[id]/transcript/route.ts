import { NextResponse } from "next/server";
import { z } from "zod";
import { lessonFor } from "@/lib/access";
import { LIMIT, readJson } from "@/lib/http";
import { updateLesson } from "@/lib/store";
import type { TranscriptSegment } from "@/lib/types";

type Params = { params: Promise<{ id: string }> };

const Late = z.object({
  segments: z
    .array(z.object({ t: z.number().nonnegative(), text: z.string().min(1).max(4000), tag: z.string().max(40).optional() }))
    .max(2000),
  /** The end of a lesson that could not be saved at the time. */
  end: z
    .object({
      endedAt: z.iso.datetime(),
      recordedMs: z.number().nonnegative().max(24 * 60 * 60 * 1000).optional(),
      interruptions: z
        .array(z.object({ at: z.string().max(40), kind: z.enum(["page-hidden", "track-muted", "track-ended", "audio-suspended"]) }))
        .max(200)
        .optional(),
    })
    .optional(),
});

/**
 * Text that arrived late: pieces kept on the tutor's device while there was no
 * internet, sent once it was back. Added to what the lesson already has -
 * never replacing it - in time order, each line once however often it is sent.
 * Only where the lesson's transcript is allowed at all (consent).
 */
export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const found = await lessonFor(id);
  if (!found) return NextResponse.json({ error: "No such lesson." }, { status: 404 });
  const raw = await readJson<unknown>(request, LIMIT.transcript);
  if (raw instanceof Response) return raw;
  const parsed = Late.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "That is not a transcript." }, { status: 400 });
  const { segments, end } = parsed.data;

  const lesson = await updateLesson(id, (current) => {
    const patch: Partial<typeof current> = {};
    if (current.capture !== "tutor" && segments.length) {
      const key = (s: Pick<TranscriptSegment, "t" | "text">) => `${Math.round(s.t)}|${s.text.trim()}`;
      const have = new Set(current.transcript.map(key));
      const added = segments.filter((s) => !have.has(key(s))).map((s) => ({ t: s.t, text: s.text.trim(), ...(s.tag && { tag: s.tag }) }));
      if (added.length) patch.transcript = [...current.transcript, ...added].sort((a, b) => a.t - b.t);
    }
    // The end is set once; a lesson already ended keeps its own.
    if (end && !current.endedAt) {
      patch.endedAt = end.endedAt;
      if (end.recordedMs !== undefined) patch.recordedMs = end.recordedMs;
      if (end.interruptions) patch.interruptions = end.interruptions;
    }
    return Object.keys(patch).length ? patch : null;
  });
  return NextResponse.json({ ok: true, lines: lesson?.transcript.length ?? 0, endedAt: lesson?.endedAt ?? null });
}
