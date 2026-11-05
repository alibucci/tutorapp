import { NextResponse } from "next/server";
import { owns } from "@/lib/access";
import { getFamilySession, getSession } from "@/lib/auth";
import { LIMIT, readJson } from "@/lib/http";
import { markGame, withGame } from "@/lib/math";
import { getStudent, getStudentByKey, updateStudent } from "@/lib/store";

/**
 * A finished game of sums, from the child: signed in, or holding their private
 * link. The page sends what was asked and answered, and the score is worked
 * out here, so what the parent and tutor read is not a number a page reported.
 */
export async function POST(request: Request) {
  const parsed = await readJson<{ key?: unknown; level?: unknown; replies?: unknown }>(
    request,
    LIMIT.small,
  );
  if (parsed instanceof Response) return parsed;
  const { key, level, replies } = parsed;

  const family = await getFamilySession();
  const student =
    typeof key === "string" && key
      ? await getStudentByKey("studentKey", key)
      : family
        ? await getStudent(family.id)
        : null;
  if (!student) {
    return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  }
  // The tutor's own session on the child's link is a preview, not the child.
  const session = await getSession();
  if (session && owns(session, student)) {
    return NextResponse.json({ error: "A preview is not saved." }, { status: 403 });
  }
  if (!student.math?.on) {
    return NextResponse.json({ error: "Math practice is not on." }, { status: 403 });
  }

  const game = markGame(level, replies, new Date().toISOString());
  if (!game) {
    return NextResponse.json({ error: "Those are not this level's sums." }, { status: 400 });
  }

  const updated = await updateStudent(student.id, (current) =>
    current.math?.on ? { math: withGame(current.math, game) } : null,
  );
  return NextResponse.json({
    right: game.right,
    total: game.total,
    level: updated?.math?.level ?? game.level,
  });
}
