import { LIMIT, readForm, readJson } from "@/lib/http";
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

  // Read with a ceiling: the size check below only runs after parsing, which
  // would otherwise buffer whatever was sent.
  const form = await readForm(request, LIMIT.upload);
  if (form instanceof Response) return form;
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

  const imageFile = await saveImage(id, data);

  // Decided against the record as it is now, not as it was before the
  // upload: the child may have handed in answers while it was arriving.
  let replaced: string | undefined;
  let refused = false;
  const lesson = await updateLesson(id, (current) => {
    if (current.homework?.answers) {
      refused = true;
      return null;
    }
    const homework = current.homework ?? blankHomework(current.summary?.homeworkFocus);
    replaced = homework.imageFile;
    return { homework: { ...homework, imageFile } };
  });

  if (refused) {
    await deleteImage(imageFile);
    return NextResponse.json(
      { error: "The homework has already been answered." },
      { status: 409 },
    );
  }
  await deleteImage(replaced);
  return NextResponse.json(lesson?.homework);
}

/** Change the focus line, send it to the child, or take it back. */
export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const found = await lessonFor(id);
  if (!found) {
    return NextResponse.json({ error: "No such lesson." }, { status: 404 });
  }
  const parsed = await readJson<{ focus?: string; send?: boolean; pick?: string }>(
    request,
    LIMIT.small,
  );
  if (parsed instanceof Response) return parsed;
  const body = parsed;

  let problem: { error: string; status: number } | null = null;
  let dropped: string[] = [];
  const lesson = await updateLesson(id, (current) => {
    const next: Homework = {
      ...(current.homework ?? blankHomework(current.summary?.homeworkFocus)),
    };
    // Choosing one of the drawn options makes it the picture; the rest, and
    // the picture it replaces, go.
    if (typeof body.pick === "string") {
      if (next.answers) {
        problem = { error: "It has already been answered.", status: 409 };
        return null;
      }
      if (!next.candidates?.includes(body.pick)) {
        problem = { error: "That picture is not one of the options.", status: 400 };
        return null;
      }
      dropped = [
        ...next.candidates.filter((n) => n !== body.pick),
        ...(next.imageFile && next.imageFile !== body.pick ? [next.imageFile] : []),
      ];
      next.imageFile = body.pick;
      next.candidates = [];
    }
    if (typeof body.focus === "string") next.focus = body.focus.trim().slice(0, 300);
    if (body.send === true) {
      if (!next.imageFile && !next.exercises?.length) {
        problem = { error: "Add a picture or build the games before sending.", status: 400 };
        return null;
      }
      next.sentAt ??= new Date().toISOString();
    }
    if (body.send === false) {
      if (next.answers) {
        problem = { error: "It has already been answered.", status: 409 };
        return null;
      }
      delete next.sentAt;
    }
    return { homework: next };
  });

  if (problem) {
    const { error, status } = problem;
    return NextResponse.json({ error }, { status });
  }
  await Promise.all(dropped.map((n) => deleteImage(n)));
  return NextResponse.json(lesson?.homework);
}
