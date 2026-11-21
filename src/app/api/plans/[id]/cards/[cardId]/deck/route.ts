import { NextResponse } from "next/server";
import { deckFor, packFileName } from "@/lib/deckFor";
import { planFor, storyCardOpen, updateCard } from "@/lib/plans";

type Params = { params: Promise<{ id: string; cardId: string }> };

/**
 * The lesson's slides as one HTML document.
 * - plain GET: to show in the browser, pictures loaded from the server;
 * - `?pack=1`: the same document with every picture written into it, as a
 *   file to save - it opens with a double click and needs no internet.
 */
export async function GET(request: Request, { params }: Params) {
  const { id, cardId } = await params;
  const found = await planFor(id);
  const card = found?.plan.cards.find((c) => c.id === cardId);
  if (!found || !card || !(await storyCardOpen(found.plan, card))) {
    return NextResponse.json({ error: "No such lesson." }, { status: 404 });
  }
  if (!card.materials?.slides.length) {
    return NextResponse.json({ error: "This lesson has no slides yet." }, { status: 409 });
  }
  const pack = new URL(request.url).searchParams.get("pack") === "1";
  const html = await deckFor(found.plan, card, pack);
  // Saved: the board shows it ready offline until the lesson changes.
  if (pack) await updateCard(id, cardId, (c) => ({ packAt: new Date().toISOString(), updatedAt: c.updatedAt }));
  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      ...(pack && { "Content-Disposition": `attachment; filename="${packFileName(card.topic)}"` }),
    },
  });
}
