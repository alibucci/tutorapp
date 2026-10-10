import { NextResponse } from "next/server";
import { lessonFor } from "@/lib/access";
import { updateLesson } from "@/lib/store";
import { labelSpeakers, studentWordShare } from "@/lib/diarize";
import { writeParentMessage } from "@/lib/parentMessage";
import { summarizeLesson } from "@/lib/summarize";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Params) {
  const { id } = await params;
  const found = await lessonFor(id);
  if (!found) {
    return NextResponse.json({ error: "No such lesson." }, { status: 404 });
  }
  const { lesson, student } = found;

  if (!lesson.transcript.length && !lesson.debrief.length) {
    return NextResponse.json(
      { error: "Nothing to summarise yet - record a lesson or a debrief." },
      { status: 400 },
    );
  }

  try {
    // Speaker labels only mean something when the student is in the same room
    // as the microphone. Online, their voice comes out of a speaker and the
    // browser's echo cancellation removes most of it, so the labels - and any
    // share-of-talk number built on them - would be noise. Skipping it there
    // also saves a whole model call.
    const inRoom = lesson.capture === "both" && lesson.mode === "classroom";
    let working = lesson;
    if (inRoom && lesson.transcript.length) {
      const transcript = await labelSpeakers(lesson.transcript);
      working = { ...lesson, transcript };
    }

    // Independent of each other, so they run side by side rather than one
    // after the other - the wait is the slower of the two, not the sum.
    const [summary, parentMessage] = await Promise.all([
      summarizeLesson(working, student),
      // A tutor's edited message is theirs; regenerating the summary must
      // not quietly overwrite it.
      lesson.parentMessage?.editedAt
        ? Promise.resolve(lesson.parentMessage)
        : writeParentMessage(working, student),
    ]);
    summary.studentWordShare = inRoom
      ? studentWordShare(working.transcript)
      : undefined;

    return NextResponse.json(
      await updateLesson(id, {
        transcript: working.transcript,
        summary,
        parentMessage,
      }),
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Summary failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
