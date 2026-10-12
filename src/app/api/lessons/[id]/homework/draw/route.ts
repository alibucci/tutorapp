import { NextResponse } from "next/server";
import { lessonFor } from "@/lib/access";
import { gameStyle } from "@/lib/gameStyles";
import { PictureError, canDrawPictures, drawPictures } from "@/lib/imageGen";
import { picturePrompt, writeScene } from "@/lib/scenePrompt";
import { homeworkDone } from "@/lib/homework";
import { deleteImage, saveImage, updateLesson } from "@/lib/store";
import type { Lesson, Student } from "@/lib/types";

type Params = { params: Promise<{ id: string }> };

/** Options to choose from. Each one is paid for, so a few, not a gallery. */
const OPTIONS = 3;

/**
 * Drawings in progress, by lesson. A tutor who taps twice, or comes back to
 * the page while it is still drawing, joins the drawing already under way
 * rather than paying for a second one. In-process, which is right for one
 * server.
 */
const running = new Map<string, Promise<Response>>();

/** Draw a few pictures for this lesson's homework, for the tutor to pick. */
export async function POST(_request: Request, { params }: Params) {
  const { id } = await params;
  const found = await lessonFor(id);
  if (!found) {
    return NextResponse.json({ error: "No such lesson." }, { status: 404 });
  }
  if (!found.lesson.summary) {
    return NextResponse.json(
      { error: "The pictures are drawn from the summary - write that first." },
      { status: 400 },
    );
  }
  if (!canDrawPictures()) {
    return NextResponse.json({ error: "Drawing pictures is switched off." }, { status: 404 });
  }
  if (homeworkDone(found.lesson.homework)) {
    return NextResponse.json({ error: "The homework has already been answered." }, { status: 409 });
  }

  let job = running.get(id);
  if (!job) {
    job = draw(id, found.lesson, found.student).finally(() => running.delete(id));
    running.set(id, job);
  }
  return (await job).clone();
}

async function draw(id: string, lesson: Lesson, student: Student): Promise<Response> {
  const style = gameStyle(student.gameStyle);
  try {
    // A redraw asks for a different scene, not the same one again.
    const scene = await writeScene(lesson, style, lesson.homework?.scene);
    const images = await drawPictures(picturePrompt(scene, style), OPTIONS);
    const names = await Promise.all(images.map((img) => saveImage(id, img.data, img.ext)));

    let stale: string[] = [];
    const updated = await updateLesson(id, (current) => {
      const homework = current.homework ?? { focus: current.summary?.homeworkFocus ?? "" };
      if (homework.answers) return null;
      // The previous options were never picked; this set replaces them.
      stale = (homework.candidates ?? []).filter((n) => n !== homework.imageFile);
      return { homework: { ...homework, candidates: names, scene } };
    });
    if (updated?.homework?.answers) {
      await Promise.all(names.map((n) => deleteImage(n)));
      return NextResponse.json({ error: "The homework has already been answered." }, { status: 409 });
    }
    await Promise.all(stale.map((n) => deleteImage(n)));
    return NextResponse.json(updated?.homework);
  } catch (e) {
    const message =
      e instanceof PictureError ? e.message : "Could not draw the pictures. Try again.";
    if (!(e instanceof PictureError)) console.error("[draw]", e);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
