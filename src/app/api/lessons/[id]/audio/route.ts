import { NextResponse } from "next/server";
import { lessonFor } from "@/lib/access";
import { createReadStream } from "fs";
import { stat } from "fs/promises";
import { Readable } from "stream";
import { appendAudio, audioPath, updateLesson } from "@/lib/store";

type Params = { params: Promise<{ id: string }> };

/**
 * One second of 24 kbit/s audio is about 3 KB, so this is enormous for a chunk
 * and still sane for a whole file sent at once. Without a ceiling one request
 * can fill the disk or the heap.
 */
const MAX_UPLOAD_BYTES = 64 * 1024 * 1024;

/**
 * Take one chunk of a recording, or a whole one.
 *
 * `seq` is the chunk's position: 0 starts the file, anything higher appends.
 * A client that sends no `seq` is treated as sending the entire recording in
 * one request, which is what the whole-blob path used to do.
 */
export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const found = await lessonFor(id);
  if (!found) {
    return NextResponse.json({ error: "No such lesson." }, { status: 404 });
  }

  const form = await request.formData();
  const file = form.get("audio");
  const kind = form.get("kind") === "debrief" ? "debrief" : "lesson";
  const seq = Number(form.get("seq") ?? 0);

  if (!Number.isInteger(seq) || seq < 0) {
    return NextResponse.json({ error: "Bad chunk number." }, { status: 400 });
  }

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No audio in request." }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: "That recording is too large." },
      { status: 413 },
    );
  }
  if (!file.type.startsWith("audio/")) {
    return NextResponse.json(
      { error: "That is not an audio file." },
      { status: 415 },
    );
  }

  const ext = file.type.includes("mp4") ? "m4a" : file.type.includes("ogg") ? "ogg" : "webm";
  const name = await appendAudio(id, kind, await file.arrayBuffer(), ext, seq);

  // Record the filename once, on the chunk that starts the file.
  if (seq === 0) {
    await updateLesson(
      id,
      kind === "debrief" ? { debriefAudioFile: name } : { audioFile: name },
    );
  }
  return NextResponse.json({ ok: true, seq });
}

/** Stream a stored recording back for playback. `?kind=debrief` for the debrief. */
export async function GET(request: Request, { params }: Params) {
  const { id } = await params;
  // Audio is the most sensitive thing here - check ownership before streaming.
  const found = await lessonFor(id);
  const kind = new URL(request.url).searchParams.get("kind");
  const name =
    kind === "debrief" ? found?.lesson.debriefAudioFile : found?.lesson.audioFile;

  if (!name) {
    return NextResponse.json({ error: "No recording." }, { status: 404 });
  }

  const full = audioPath(name);
  const { size } = await stat(full);
  const stream = Readable.toWeb(
    createReadStream(full),
  ) as unknown as ReadableStream;

  return new Response(stream, {
    headers: {
      "Content-Type": name.endsWith(".m4a") ? "audio/mp4" : "audio/webm",
      "Content-Length": String(size),
    },
  });
}
