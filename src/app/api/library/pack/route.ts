import { NextResponse } from "next/server";
import { deckFor, renderBundle } from "@/lib/deckFor";
import { planFor, updateCard } from "@/lib/plans";

/** A week or a month at once: `?c=planId:cardId`, repeated, up to 12 lessons. */
export async function GET(request: Request) {
  const refs = new URL(request.url).searchParams.getAll("c").slice(0, 12);
  if (!refs.length) return NextResponse.json({ error: "Pick the lessons." }, { status: 400 });
  const lessons: { title: string; html: string }[] = [];
  for (const ref of refs) {
    const [planId, cardId] = ref.split(":");
    const found = planId && cardId ? await planFor(planId) : null;
    const card = found?.plan.cards.find((c) => c.id === cardId);
    if (!found || !card || card.story) return NextResponse.json({ error: "No such lesson." }, { status: 404 });
    if (!card.materials?.slides.length) continue;
    lessons.push({ title: card.topic || "Lesson", html: await deckFor(found.plan, card, true) });
    await updateCard(planId, cardId, (c) => ({ packAt: new Date().toISOString(), updatedAt: c.updatedAt }));
  }
  if (!lessons.length) return NextResponse.json({ error: "None of these has slides yet." }, { status: 409 });
  return new NextResponse(renderBundle(lessons), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Disposition": `attachment; filename="aloudli-${lessons.length}-lessons.html"`,
    },
  });
}
