import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { readBytes } from "@/lib/http";
import {
  MAX_CLIP_BYTES,
  TranscribeError,
  acceptsCompressed,
  canTranscribe,
  transcribe,
  transcribeLines,
} from "@/lib/speech";
import { DEFAULT_LANGUAGE, LESSON_LANGUAGES } from "@/lib/types";

/**
 * One short recording in, its text out. The body is the audio itself, as the
 * browser recorded it, or 16 kHz WAV when asked for; the language comes in the
 * query.
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

  const query = new URL(request.url).searchParams;
  const tag = query.get("lang") ?? "";
  const language = LESSON_LANGUAGES.some((l) => l.tag === tag) ? tag : DEFAULT_LANGUAGE;
  const mimeType = request.headers.get("content-type") ?? "";
  if (!mimeType.startsWith("audio/")) {
    return NextResponse.json({ error: "That is not audio." }, { status: 415 });
  }

  const kind = mimeType.split(";")[0];
  // The browser converts and sends again; the clip is still on the page.
  const asWav = { error: "Send this one as WAV.", retryAs: "wav" };
  if (kind !== "audio/wav" && !acceptsCompressed()) {
    return NextResponse.json(asWav, { status: 422 });
  }

  const audio = await readBytes(request, MAX_CLIP_BYTES);
  if (audio instanceof Response) return audio;
  if (audio.byteLength === 0) return NextResponse.json({ text: "" });

  try {
    // A group lesson wants each sentence separately, to credit it to someone.
    if (query.get("lines")) {
      return NextResponse.json({
        lines: await transcribeLines(audio, kind, language),
      });
    }
    const text = await transcribe(audio, kind, language);
    return NextResponse.json({ text });
  } catch (e) {
    // A container the provider could not read - Safari's fragmented MP4 is
    // the likely one. WAV always works.
    if (e instanceof TranscribeError && e.status === 400 && kind !== "audio/wav") {
      console.error(`transcribe: ${kind} refused, asking for WAV:`, e.message);
      return NextResponse.json(asWav, { status: 422 });
    }
    const message =
      e instanceof TranscribeError ? e.message : "The speech service could not be reached.";
    console.error("transcribe:", e);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
