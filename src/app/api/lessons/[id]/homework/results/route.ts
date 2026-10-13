import { NextResponse } from "next/server";
import { homeworkFor } from "@/lib/access";
import { LIMIT, readJson } from "@/lib/http";
import { noticeHomeworkDone } from "@/lib/notices";
import { updateLesson } from "@/lib/store";
import type { Exercise, ExerciseKind, RoundAnswer, RoundReply } from "@/lib/types";

type Params = { params: Promise<{ id: string }> };

const KINDS: ExerciseKind[] = ["choose", "build", "catch"];

/**
 * Mark one round.
 *
 * The browser sends what the child answered and nothing else. The verdict is
 * worked out here, against the exercise the tutor approved, so a score is a
 * fact about the child rather than a number the page was trusted to report.
 */
function mark(exercise: Exercise, index: number, reply: RoundReply): RoundAnswer | null {
  if (exercise.kind === "choose") {
    const round = exercise.rounds[index];
    if (!round || typeof reply !== "number") return null;
    const picked = round.options[reply];
    return {
      asked: round.sentence,
      answered: picked ?? "(nothing)",
      right: reply === round.answer,
    };
  }
  if (exercise.kind === "build") {
    const round = exercise.rounds[index];
    if (!round || !Array.isArray(reply)) return null;
    const given = reply.map(String).join(" ");
    return {
      asked: round.answer.join(" "),
      answered: given,
      right: given === round.answer.join(" "),
    };
  }
  const round = exercise.rounds[index];
  if (!round || typeof reply !== "boolean") return null;
  return {
    asked: round.word,
    answered: reply ? "kept it" : "sent it away",
    right: reply === round.keep,
  };
}

/**
 * One finished game. A replay replaces the earlier score rather than adding
 * to it, so the record is always the latest attempt.
 */
export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const parsed = await readJson<{
    key?: string;
    kind?: string;
    replies?: unknown;
  }>(request, LIMIT.medium);
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
  if (!Array.isArray(parsed.replies)) {
    return NextResponse.json({ error: "No answers in request." }, { status: 400 });
  }

  // Never more rounds than the game has, whatever arrives.
  const replies = (parsed.replies as RoundReply[]).slice(0, exercise.rounds.length);
  const rounds = replies
    .map((reply, i) => mark(exercise, i, reply))
    .filter((r): r is RoundAnswer => r !== null);
  const right = rounds.filter((r) => r.right).length;

  const before = found.lesson;
  const after = await updateLesson(id, (current) => {
    const homework = current.homework;
    if (!homework?.sentAt) return null;
    const rest = (homework.results ?? []).filter((r) => r.kind !== kind);
    return {
      homework: {
        ...homework,
        results: [
          ...rest,
          {
            kind,
            topic: exercise.topic,
            right,
            total: exercise.rounds.length,
            finishedAt: new Date().toISOString(),
            rounds,
          },
        ],
      },
    };
  });
  noticeHomeworkDone(before, after);

  return NextResponse.json({ right, total: exercise.rounds.length });
}
