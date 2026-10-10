import { NextResponse } from "next/server";
import { homeworkFor } from "@/lib/access";
import { updateLesson } from "@/lib/store";

type Params = { params: Promise<{ id: string }> };

const MAX = 2000;

function clean(value: unknown, max = MAX): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

/** The child hands the homework in. Once - after that it is the tutor's. */
export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const body = (await request.json()) as {
    key?: string;
    describe?: unknown;
    next?: unknown;
    adjectives?: unknown;
  };

  const found = await homeworkFor(id, body.key ?? null);
  if (!found || found.tutor || !found.lesson.homework) {
    return NextResponse.json({ error: "No such homework." }, { status: 404 });
  }
  if (found.lesson.homework.answers) {
    return NextResponse.json({ error: "Already handed in." }, { status: 409 });
  }

  const describe = clean(body.describe);
  const next = clean(body.next);
  const adjectives = Array.isArray(body.adjectives)
    ? body.adjectives.map((a) => clean(a, 40)).filter(Boolean)
    : [];
  if (!describe || !next || adjectives.length !== 3) {
    return NextResponse.json(
      { error: "Answer every task, with three adjectives." },
      { status: 400 },
    );
  }

  await updateLesson(id, {
    homework: {
      ...found.lesson.homework,
      answers: {
        describe,
        next,
        adjectives: [adjectives[0], adjectives[1], adjectives[2]],
        submittedAt: new Date().toISOString(),
      },
    },
  });
  return NextResponse.json({ ok: true });
}
