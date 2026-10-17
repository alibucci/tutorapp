import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { readBytes } from "@/lib/http";
import { MAX_CLIP_BYTES, TranscribeError, canTranscribe, transcribe } from "@/lib/speech";
import { DEFAULT_LANGUAGE, LESSON_LANGUAGES } from "@/lib/types";

/**
 * One short recording in, its text out. The body is the audio itself, 16 kHz
 * WAV made in the browser; the language comes in the query.
 *
 * Signed-in only: every call is paid for. Nothing is kept - the audio lives in
 * memory for the length of this request.
 */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { error: "Sign in to use transcription." },
      { status: 401 },
    );
  }
  if (!canTranscribe()) {
    return NextResponse.json(
      { error: "Transcription is not set up on this server (no DASHSCOPE_API_KEY)." },
      { status: 503 },
    );
  }

  const tag = new URL(request.url).searchParams.get("lang") ?? "";
  const language = LESSON_LANGUAGES.some((l) => l.tag === tag) ? tag : DEFAULT_LANGUAGE;
  const mimeType = request.headers.get("content-type") ?? "";
  if (!mimeType.startsWith("audio/")) {
    return NextResponse.json({ error: "That is not audio." }, { status: 415 });
  }

  const audio = await readBytes(request, MAX_CLIP_BYTES);
  if (audio instanceof Response) return audio;
  if (audio.byteLength === 0) return NextResponse.json({ text: "" });

  try {
    const text = await transcribe(audio, mimeType.split(";")[0], language);
    return NextResponse.json({ text });
  } catch (e) {
    const message =
      e instanceof TranscribeError ? e.message : "The speech service could not be reached.";
    console.error("transcribe:", e);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
