import { NextResponse } from "next/server";
import { lessonFor } from "@/lib/access";
import { LIMIT, readJson } from "@/lib/http";
import { carryOver } from "@/lib/planCheck";

type Params = { params: Promise<{ id: string }> };

/** Carry what the lesson did not reach into the next planned card, or leave it. */
export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const found = await lessonFor(id);
  if (!found?.lesson.planCheck) return NextResponse.json({ error: "No plan check on this lesson." }, { status: 404 });
  const body = await readJson<{ carry?: unknown }>(request, LIMIT.small);
  if (body instanceof Response) return body;
  if (typeof body.carry !== "boolean") return NextResponse.json({ error: "Say yes or no." }, { status: 400 });
  const done = await carryOver(found.lesson, body.carry);
  if (!done) return NextResponse.json({ error: "Already answered." }, { status: 409 });
  return NextResponse.json(done);
}
