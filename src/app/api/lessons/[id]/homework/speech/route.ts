import { NextResponse } from "next/server";
import { homeworkFor } from "@/lib/access";
import { readBytes } from "@/lib/http";
import { TranscribeError, acceptsCompressed, canTranscribe, transcribe } from "@/lib/speech";

type Params = { params: Promise<{ id: string }> };

/**
 * One answer said aloud, in a homework, back as text.
 *
 * The homework's microphone used the browser's own recogniser, which needs
 * Google from Chrome - unreachable in mainland China - and does not exist at
 * all inside WeChat. So the page records the answer and it is recognised here,
 * like the lesson's own recording.
 *
 * Open to the child (their sign-in or their link) and to their tutor's
 * preview, not to the parent's link. The audio lives in memory for this
 * request and is not kept; only the words go back, into the answer box, where
 * the child can still change them.
 */

/** An answer is a sentence or two: a minute of WAV is far more than that. */
const MAX_BYTES = 2 * 1024 * 1024;

export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const key = new URL(request.url).searchParams.get("key");

  const found = await homeworkFor(id, key);
  const parent = Boolean(key) && key === found?.student.parentKey;
  if (!found || parent) {
    return NextResponse.json({ error: "No such homework." }, { status: 404 });
  }
  if (!canTranscribe()) {
    return NextResponse.json({ error: "Speaking is not set up on this server." }, { status: 503 });
  }

  const mimeType = request.headers.get("content-type") ?? "";
  if (!mimeType.startsWith("audio/")) {
    return NextResponse.json({ error: "That is not audio." }, { status: 415 });
  }
  const kind = mimeType.split(";")[0];
  const asWav = { error: "Send this one as WAV.", retryAs: "wav" };
  if (kind !== "audio/wav" && !acceptsCompressed()) {
    return NextResponse.json(asWav, { status: 422 });
  }

  const audio = await readBytes(request, MAX_BYTES);
  if (audio instanceof Response) return audio;
  if (audio.byteLength === 0) return NextResponse.json({ text: "" });

  try {
    // Homework answers are in English, whatever the lesson was taught in.
    return NextResponse.json({ text: await transcribe(audio, kind, "en-US") });
  } catch (e) {
    if (e instanceof TranscribeError && e.status === 400 && kind !== "audio/wav") {
      return NextResponse.json(asWav, { status: 422 });
    }
    console.error("homework speech:", e);
    return NextResponse.json({ error: "The speech service could not be reached." }, { status: 502 });
  }
}
