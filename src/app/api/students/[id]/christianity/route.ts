import { NextResponse } from "next/server";
import { studentFor } from "@/lib/access";
import {
  StoryNotBuilt,
  buildStoryHomework,
  christianityOpenTo,
  moduleOf,
  nextStory,
  setModule,
} from "@/lib/christianity";
import { LIMIT, readJson } from "@/lib/http";
import { createLesson, updateLesson } from "@/lib/store";
import { DEFAULT_LANGUAGE } from "@/lib/types";

type Params = { params: Promise<{ id: string }> };

/** One build per learner at a time: a second tap joins the first. */
const running = new Map<string, Promise<Response>>();

/**
 * Switch the module on or off for this learner. On needs `parentAsked`: the
 * tutor ticks that the parent asked for it, and the server stamps the time.
 */
export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const found = await studentFor(id);
  if (!found || !(await christianityOpenTo(found.session))) {
    return NextResponse.json({ error: "No such student." }, { status: 404 });
  }
  const body = await readJson<{ on?: unknown; parentAsked?: unknown }>(request, LIMIT.small);
  if (body instanceof Response) return body;
  if (typeof body.on !== "boolean") {
    return NextResponse.json({ error: "Say on or off." }, { status: 400 });
  }
  const result = await setModule(found.student, body.on, body.parentAsked === true);
  if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json(result.student?.modules?.christianity ?? null);
}

/**
 * Build the next story's homework. The system picks the story; the tutor
 * never picks a number. Nothing is made unless the text passes the checks:
 * on failure the tutor is told and there is no half-built homework to send.
 */
export async function POST(_request: Request, { params }: Params) {
  const { id } = await params;
  const found = await studentFor(id);
  if (!found || found.student.archivedAt || !(await christianityOpenTo(found.session))) {
    return NextResponse.json({ error: "No such student." }, { status: 404 });
  }
  const state = moduleOf(found.student);
  if (!state?.enabled) {
    return NextResponse.json({ error: "Christianity is not switched on for this learner." }, { status: 400 });
  }
  const next = nextStory(state);
  if (!next) {
    return NextResponse.json(
      { error: "That's all for now: every story in the programme has been done." },
      { status: 409 },
    );
  }

  let job = running.get(id);
  if (!job) {
    job = (async () => {
      try {
        const built = await buildStoryHomework(found.student, next.card, next.review);
        const now = new Date().toISOString();
        const lesson = await createLesson({
          title: next.card.title,
          kind: "practice",
          request: `Christianity · ${next.card.title} (${next.card.reference})`,
          module: {
            id: "christianity",
            storyId: next.card.id,
            ...(next.review && { reviewOf: next.review.id }),
          },
          studentId: found.student.id,
          mode: "online",
          capture: "tutor",
          language: DEFAULT_LANGUAGE,
          startedAt: now,
          endedAt: now,
        });
        await updateLesson(lesson.id, { homework: built.homework, parentMessage: built.parentMessage });
        return NextResponse.json({ id: lesson.id });
      } catch (e) {
        console.error("[christianity] build", e);
        const message = e instanceof StoryNotBuilt ? e.message : "Could not build it. Try again.";
        return NextResponse.json({ error: message }, { status: 502 });
      }
    })().finally(() => running.delete(id));
    running.set(id, job);
  }
  return (await job).clone();
}
