import { LIMIT, readJson } from "@/lib/http";
import { NextResponse } from "next/server";
import { homeworkFor } from "@/lib/access";
import { noticeHomeworkDone } from "@/lib/notices";
import { updateLesson } from "@/lib/store";

type Params = { params: Promise<{ id: string }> };

const MAX = 2000;

function clean(value: unknown, max = MAX): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

/** The child hands the homework in. Once - after that it is the tutor's. */
export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const parsed = await readJson<{
    key?: string;
    describe?: unknown;
    next?: unknown;
    adjectives?: unknown;
  }>(request, LIMIT.medium);
  if (parsed instanceof Response) return parsed;
  const body = parsed;

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

  // Checked again under the lock: two taps on "Craft it" must not both land,
  // and the tutor may have taken the homework back meanwhile.
  let accepted = false;
  const before = found.lesson;
  const after = await updateLesson(id, (current) => {
    if (!current.homework?.sentAt || current.homework.answers) return null;
    accepted = true;
    return {
      homework: {
        ...current.homework,
        answers: {
          describe,
          next,
          adjectives: [adjectives[0], adjectives[1], adjectives[2]],
          submittedAt: new Date().toISOString(),
        },
      },
    };
  });
  if (!accepted) {
    return NextResponse.json({ error: "Already handed in." }, { status: 409 });
  }
  noticeHomeworkDone(before, after);
  return NextResponse.json({ ok: true });
}
