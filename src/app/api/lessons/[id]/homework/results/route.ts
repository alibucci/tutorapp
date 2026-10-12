import { NextResponse } from "next/server";
import { homeworkFor } from "@/lib/access";
import { LIMIT, readJson } from "@/lib/http";
import { updateLesson } from "@/lib/store";
import type { ExerciseKind } from "@/lib/types";

type Params = { params: Promise<{ id: string }> };

const KINDS: ExerciseKind[] = ["choose", "build", "catch"];

/**
 * One finished game. The score is checked against the game it claims to be:
 * a child cannot report more right answers than the game has rounds, and a
 * replay replaces the earlier score rather than adding to it.
 */
export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const parsed = await readJson<{
    key?: string;
    kind?: string;
    right?: number;
  }>(request, LIMIT.small);
  if (parsed instanceof Response) return parsed;

  const found = await homeworkFor(id, parsed.key ?? null);
  if (!found || found.tutor || !found.lesson.homework) {
    return NextResponse.json({ error: "No such homework." }, { status: 404 });
  }

  const kind = KINDS.find((k) => k === parsed.kind);
  const exercise = found.lesson.homework.exercises?.find((e) => e.kind === kind);
  if (!kind || !exercise) {
    return NextResponse.json({ error: "No such game." }, { status: 400 });
  }

  const total = exercise.rounds.length;
  const right = Math.max(0, Math.min(total, Math.round(Number(parsed.right ?? 0))));

  await updateLesson(id, (current) => {
    const homework = current.homework;
    if (!homework?.sentAt) return null;
    const rest = (homework.results ?? []).filter((r) => r.kind !== kind);
    return {
      homework: {
        ...homework,
        results: [
          ...rest,
          { kind, topic: exercise.topic, right, total, finishedAt: new Date().toISOString() },
        ],
      },
    };
  });

  return NextResponse.json({ right, total });
}
