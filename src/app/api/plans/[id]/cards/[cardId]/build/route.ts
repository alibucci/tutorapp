import { NextResponse } from "next/server";
import { LIMIT, readJson } from "@/lib/http";
import { isBuilding, planFor, remakeSlide, startBuild, startRedraw } from "@/lib/plans";

type Params = { params: Promise<{ id: string; cardId: string }> };

/**
 * Write the lesson's materials again.
 * - `{ wish?, keepEdited? }`  the whole lesson, in the background. Slides the
 *   tutor changed by hand stay where they are unless keepEdited is false.
 * - `{ slideId, wish }`       one slide, answered straight away.
 * - `{ slideId, redraw }`     a new picture for one slide, in the background.
 */
export async function POST(request: Request, { params }: Params) {
  const { id, cardId } = await params;
  const found = await planFor(id);
  const card = found?.plan.cards.find((c) => c.id === cardId);
  if (!found || !card) return NextResponse.json({ error: "No such lesson." }, { status: 404 });
  const body = await readJson<{ wish?: unknown; keepEdited?: unknown; slideId?: unknown; redraw?: unknown }>(
    request,
    LIMIT.small,
  );
  if (body instanceof Response) return body;

  // A new picture for one slide.
  if (body.redraw === true && typeof body.slideId === "string") {
    if (isBuilding(card)) return NextResponse.json({ error: "The lesson is being written. Wait for it." }, { status: 409 });
    if (!(await startRedraw(found.plan, card, body.slideId))) {
      return NextResponse.json({ error: "No picture can be drawn for this slide." }, { status: 409 });
    }
    return NextResponse.json({ ok: true }, { status: 202 });
  }
  const wish = typeof body.wish === "string" ? body.wish.trim().slice(0, 400) : "";

  if (typeof body.slideId === "string") {
    if (!wish) return NextResponse.json({ error: "Say what to change on the slide." }, { status: 400 });
    if (isBuilding(card)) return NextResponse.json({ error: "The lesson is being written. Wait for it." }, { status: 409 });
    try {
      const done = await remakeSlide(found.plan, card, body.slideId, wish);
      if (!done) return NextResponse.json({ error: "No such slide." }, { status: 404 });
      return NextResponse.json(done.card);
    } catch (e) {
      console.error("[plans] slide", e);
      return NextResponse.json({ error: "Could not write the slide. Try again." }, { status: 502 });
    }
  }

  if (isBuilding(card)) return NextResponse.json(card, { status: 202 });
  const started = await startBuild(id, cardId, {
    ...(wish && { wish }),
    keepEdited: body.keepEdited !== false,
  });
  return NextResponse.json(started, { status: 202 });
}
