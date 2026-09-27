import { NextResponse } from "next/server";
import { lessonFor } from "@/lib/access";
import { createReadStream } from "fs";
import { stat } from "fs/promises";
import { Readable } from "stream";
import { audioPath, saveAudio, updateLesson } from "@/lib/store";

type Params = { params: Promise<{ id: string }> };

/** Upload the tutor's recording for a lesson or its debrief. */
export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const found = await lessonFor(id);
  if (!found) {
    return NextResponse.json({ error: "No such lesson." }, { status: 404 });
  }

  const form = await request.formData();
  const file = form.get("audio");
  const kind = form.get("kind") === "debrief" ? "debrief" : "lesson";

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No audio in request." }, { status: 400 });
  }

  const ext = file.type.includes("mp4") ? "m4a" : file.type.includes("ogg") ? "ogg" : "webm";
  const name = await saveAudio(id, kind, await file.arrayBuffer(), ext);

  const updated = await updateLesson(
    id,
    kind === "debrief" ? { debriefAudioFile: name } : { audioFile: name },
  );
  return NextResponse.json(updated);
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
