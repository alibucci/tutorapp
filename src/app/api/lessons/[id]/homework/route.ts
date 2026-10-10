import { NextResponse } from "next/server";
import { lessonFor } from "@/lib/access";
import { deleteImage, saveImage, updateLesson } from "@/lib/store";
import type { Homework } from "@/lib/types";

type Params = { params: Promise<{ id: string }> };

/** The browser shrinks the photo to a JPEG first; this is a generous ceiling. */
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

function blankHomework(focus = ""): Homework {
  return { focus };
}

/** Upload or replace the picture. */
export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const found = await lessonFor(id);
  if (!found) {
    return NextResponse.json({ error: "No such lesson." }, { status: 404 });
  }
  if (found.lesson.homework?.answers) {
    return NextResponse.json(
      { error: "The homework has already been answered." },
      { status: 409 },
    );
  }

  const form = await request.formData();
  const file = form.get("image");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No picture in request." }, { status: 400 });
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return NextResponse.json({ error: "That picture is too large." }, { status: 413 });
  }
  const data = await file.arrayBuffer();
  // Trust the bytes, not the declared type: only JPEGs are stored or served.
  const head = new Uint8Array(data.slice(0, 3));
  if (head[0] !== 0xff || head[1] !== 0xd8 || head[2] !== 0xff) {
    return NextResponse.json({ error: "That is not a JPEG." }, { status: 415 });
  }

  const current =
    found.lesson.homework ?? blankHomework(found.lesson.summary?.homeworkFocus);
  const imageFile = await saveImage(id, data);
  await deleteImage(current.imageFile);
  const lesson = await updateLesson(id, { homework: { ...current, imageFile } });
  return NextResponse.json(lesson?.homework);
}

/** Change the focus line, send it to the child, or take it back. */
export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const found = await lessonFor(id);
  if (!found) {
    return NextResponse.json({ error: "No such lesson." }, { status: 404 });
  }
  const body = (await request.json()) as { focus?: string; send?: boolean };
  const current =
    found.lesson.homework ?? blankHomework(found.lesson.summary?.homeworkFocus);
  const next: Homework = { ...current };

  if (typeof body.focus === "string") next.focus = body.focus.trim().slice(0, 300);
  if (body.send === true) {
    if (!next.imageFile) {
      return NextResponse.json(
        { error: "Add a picture before sending." },
        { status: 400 },
      );
    }
    next.sentAt = new Date().toISOString();
  }
  if (body.send === false) {
    if (next.answers) {
      return NextResponse.json(
        { error: "It has already been answered." },
        { status: 409 },
      );
    }
    delete next.sentAt;
  }

  const lesson = await updateLesson(id, { homework: next });
  return NextResponse.json(lesson?.homework);
}
