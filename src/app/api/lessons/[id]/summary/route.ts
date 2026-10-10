import { NextResponse } from "next/server";
import { lessonFor } from "@/lib/access";
import { updateLesson } from "@/lib/store";
import { labelSpeakers } from "@/lib/diarize";
import { writeParentMessage } from "@/lib/parentMessage";
import { summarizeLesson } from "@/lib/summarize";
import type { Lesson, Student } from "@/lib/types";

type Params = { params: Promise<{ id: string }> };

/**
 * Generations in progress, by lesson.
 *
 * A generation keeps running when the tutor locks the phone - the server does
 * not care that the request went away - and is saved when it finishes. But a
 * tutor who comes back before then gets a page with no summary, which starts
 * another one: twice the cost, and two writers racing on one file. So a second
 * request for the same lesson waits for the first instead. In-process, which
 * is right for one server.
 */
const running = new Map<string, Promise<Response>>();

export async function POST(_request: Request, { params }: Params) {
  const { id } = await params;
  const found = await lessonFor(id);
  if (!found) {
    return NextResponse.json({ error: "No such lesson." }, { status: 404 });
  }

  let job = running.get(id);
  if (!job) {
    job = generate(id, found.lesson, found.student).finally(() => running.delete(id));
    running.set(id, job);
  }
  // A Response body can be read once; every waiter gets its own copy.
  return (await job).clone();
}

async function generate(id: string, lesson: Lesson, student: Student): Promise<Response> {
  if (!lesson.transcript.length && !lesson.debrief.length) {
    return NextResponse.json(
      { error: "Nothing to summarise yet - record a lesson or a debrief." },
      { status: 400 },
    );
  }

  try {
    // Speaker labels only mean something when the student is in the same room
    // as the microphone. Online, their voice comes out of a speaker and the
    // browser's echo cancellation removes most of it, so the labels would be
    // noise. Skipping it there also saves a whole model call.
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

    // The model took half a minute; the tutor may have edited the message
    // meanwhile. Their edit wins over what was generated - decided against the
    // record as it is now, under its lock.
    return NextResponse.json(
      await updateLesson(id, (current) => ({
        ...(working.transcript !== lesson.transcript && { transcript: working.transcript }),
        summary,
        parentMessage: current.parentMessage?.editedAt ? current.parentMessage : parentMessage,
      })),
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Summary failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
