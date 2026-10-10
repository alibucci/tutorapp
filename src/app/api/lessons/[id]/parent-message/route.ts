import { NextResponse } from "next/server";
import { lessonFor } from "@/lib/access";
import { MODEL } from "@/lib/llm";
import { translateParentMessage } from "@/lib/parentMessage";
import { updateLesson } from "@/lib/store";

type Params = { params: Promise<{ id: string }> };

/** Save the tutor's edited English and translate it again. */
export async function PUT(request: Request, { params }: Params) {
  const { id } = await params;
  const found = await lessonFor(id);
  if (!found) {
    return NextResponse.json({ error: "No such lesson." }, { status: 404 });
  }

  const { en } = (await request.json()) as { en?: string };
  const text = en?.trim();
  if (!text) {
    return NextResponse.json({ error: "The message is empty." }, { status: 400 });
  }
  if (text.length > 2000) {
    return NextResponse.json(
      { error: "That is too long for a WeChat message." },
      { status: 400 },
    );
  }

  try {
    const zh = await translateParentMessage(text);
    const now = new Date().toISOString();
    const lesson = await updateLesson(id, {
      parentMessage: {
        en: text,
        zh,
        generatedAt: found.lesson.parentMessage?.generatedAt ?? now,
        editedAt: now,
        model: MODEL,
      },
    });
    return NextResponse.json(lesson?.parentMessage);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Translation failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
