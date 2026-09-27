import { NextResponse } from "next/server";
import { lessonFor } from "@/lib/access";
import { updateLesson } from "@/lib/store";
import { labelSpeakers, studentWordShare } from "@/lib/diarize";
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
    // When both voices are on the tape, work out who said what before reading
    // the lesson - the summary is only as good as the attribution.
    let working = lesson;
    if (lesson.capture === "both" && lesson.transcript.length) {
      const transcript = await labelSpeakers(lesson.transcript);
      working = { ...lesson, transcript };
      await updateLesson(id, { transcript });
    }

    const summary = await summarizeLesson(working, student);
    summary.studentWordShare =
      working.capture === "both"
        ? studentWordShare(working.transcript)
        : undefined;

    return NextResponse.json(await updateLesson(id, { summary }));
  } catch (e) {
    const message = e instanceof Error ? e.message : "Summary failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
