import { NextResponse } from "next/server";
import { homeworkFor } from "@/lib/access";
import { LIMIT, readBytes, readJson } from "@/lib/http";
import { PronounceError, canScoreVoice, scoreLine } from "@/lib/pronounce";
import { updateLesson, updateStudent } from "@/lib/store";
import {
  VOICE_CONSENT_VERSION,
  VOICE_MAX_SECONDS,
  hasVoiceConsent,
  mayScoreVoice,
} from "@/lib/voice";

type Params = { params: Promise<{ id: string }> };

/** The parent's link opens a finished homework too; it is not the learner. */
function byParent(key: string | null | undefined, parentKey: string): boolean {
  return Boolean(key) && key === parentKey;
}

/** 16 kHz, 16-bit mono, plus the header. */
const MAX_WAV_BYTES = VOICE_MAX_SECONDS * 32_000 + 1024;

/**
 * The learner's yes or no to having their pronunciation scored.
 *
 * Only from the learner's own way in - their sign-in or their link - and only
 * for an adult. A tutor previewing the homework cannot agree on their behalf.
 */
export async function PUT(request: Request, { params }: Params) {
  const { id } = await params;
  const parsed = await readJson<{ key?: string; agree?: boolean }>(request, LIMIT.small);
  if (parsed instanceof Response) return parsed;

  const found = await homeworkFor(id, parsed.key ?? null);
  if (!found || found.tutor || byParent(parsed.key, found.student.parentKey)) {
    return NextResponse.json({ error: "No such homework." }, { status: 404 });
  }
  if (!canScoreVoice() || !mayScoreVoice(found.student)) {
    return NextResponse.json({ error: "Pronunciation checks are not offered here." }, { status: 403 });
  }

  // Undefined is dropped when the record is written: a no removes it.
  await updateStudent(found.student.id, {
    voiceConsent:
      parsed.agree === true
        ? { at: new Date().toISOString(), version: VOICE_CONSENT_VERSION }
        : undefined,
  });
  return NextResponse.json({ agreed: parsed.agree === true });
}

/**
 * One line said aloud, scored.
 *
 * The body is the recording as 16 kHz WAV; which line it is comes in the
 * query, and the line itself is read from the homework here, never from the
 * page. The recording is passed on and forgotten: only the score is kept, and
 * only for the first try at each line - the same first-answer-counts rule as
 * every other game.
 */
export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const query = new URL(request.url).searchParams;

  const found = await homeworkFor(id, query.get("key"));
  if (
    !found ||
    found.tutor ||
    byParent(query.get("key"), found.student.parentKey) ||
    !found.lesson.homework?.sentAt
  ) {
    return NextResponse.json({ error: "No such homework." }, { status: 404 });
  }
  if (!canScoreVoice() || !hasVoiceConsent(found.student)) {
    return NextResponse.json(
      { error: "Pronunciation checks are off for this learner." },
      { status: 403 },
    );
  }

  const kind = query.get("kind");
  const index = Number(query.get("round"));
  const exercise = found.lesson.homework.exercises?.find((e) => e.kind === kind);
  const line =
    exercise?.kind === "repeat"
      ? exercise.rounds[index]?.sentence
      : exercise?.kind === "dialogue"
        ? exercise.rounds[index]?.you
        : undefined;
  if (!exercise || !Number.isInteger(index) || !line) {
    return NextResponse.json({ error: "No such line." }, { status: 400 });
  }

  if (!(request.headers.get("content-type") ?? "").startsWith("audio/wav")) {
    return NextResponse.json({ error: "Send the recording as WAV." }, { status: 415 });
  }
  const audio = await readBytes(request, MAX_WAV_BYTES);
  if (audio instanceof Response) return audio;
  if (audio.byteLength < 1000) {
    return NextResponse.json({ error: "Nothing was recorded - try again." }, { status: 400 });
  }

  let result;
  try {
    result = await scoreLine(audio, line);
  } catch (e) {
    const status = e instanceof PronounceError ? e.status : 502;
    const message = e instanceof PronounceError ? e.message : "The pronunciation check failed. Try again.";
    if (!(e instanceof PronounceError)) console.error("[voice]", e);
    return NextResponse.json({ error: message }, { status });
  }

  if (query.get("attempt") === "1") {
    const slot = `${exercise.kind}.${index}`;
    await updateLesson(id, (current) => {
      const homework = current.homework;
      if (!homework?.sentAt) return null;
      return { homework: { ...homework, voice: { ...homework.voice, [slot]: result } } };
    });
  }
  return NextResponse.json(result);
}
