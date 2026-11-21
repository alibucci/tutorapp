import { NextResponse } from "next/server";
import { LIMIT, readJson } from "@/lib/http";
import { DURATIONS, planFor } from "@/lib/plans";
import { updatePlan } from "@/lib/store";
import type { LessonPlan } from "@/lib/types";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const found = await planFor((await params).id);
  if (!found) return NextResponse.json({ error: "No such plan." }, { status: 404 });
  return NextResponse.json(found.plan);
}

/** The parents' wishes, the lesson length, the order of the cards, archive. */
export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const found = await planFor(id);
  if (!found) return NextResponse.json({ error: "No such plan." }, { status: 404 });
  const body = await readJson<{
    parentWishes?: unknown;
    durationMinutes?: unknown;
    order?: unknown;
    archived?: unknown;
  }>(request, LIMIT.small);
  if (body instanceof Response) return body;

  const patch: Partial<LessonPlan> = {};
  if (typeof body.parentWishes === "string") {
    patch.parentWishes = body.parentWishes.trim().slice(0, 300) || undefined;
  }
  if (body.durationMinutes !== undefined) {
    if (!DURATIONS.includes(body.durationMinutes as 30)) {
      return NextResponse.json({ error: "A lesson is 30, 45 or 60 minutes." }, { status: 400 });
    }
    patch.durationMinutes = body.durationMinutes as LessonPlan["durationMinutes"];
  }
  if (typeof body.archived === "boolean") {
    patch.archivedAt = body.archived ? new Date().toISOString() : undefined;
  }
  let order: string[] | null = null;
  if (body.order !== undefined) {
    if (!Array.isArray(body.order) || body.order.some((x) => typeof x !== "string")) {
      return NextResponse.json({ error: "Bad order." }, { status: 400 });
    }
    order = body.order as string[];
  }
  if (!Object.keys(patch).length && !order) {
    return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
  }

  const plan = await updatePlan(id, (current) => {
    if (!order) return patch;
    // The order the tutor dragged, checked against the cards as they are now:
    // a card added meanwhile keeps its place at the end, never lost.
    const byId = new Map(current.cards.map((c) => [c.id, c]));
    const sorted = order.flatMap((cid) => (byId.has(cid) ? [byId.get(cid)!] : []));
    const rest = current.cards.filter((c) => !order!.includes(c.id));
    return { ...patch, cards: [...sorted, ...rest] };
  });
  return NextResponse.json(plan);
}
