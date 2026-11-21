import { NextResponse } from "next/server";
import { z } from "zod";
import { LIMIT, readJson } from "@/lib/http";
import { cleanSlide } from "@/lib/lessonPlan";
import { planFor, storyCardOpen, studentsOf, updateCard } from "@/lib/plans";
import { recordLiveStory, storyFor } from "@/lib/storySlides";
import { deletePlanImage, listPlans, updatePlan } from "@/lib/store";
import { SLIDE_PARTS, type PlanCard, type Slide } from "@/lib/types";
import { randomUUID } from "crypto";

type Params = { params: Promise<{ id: string; cardId: string }> };

const SlideIn = z.object({
  id: z.string().max(80).optional(),
  part: z.enum(SLIDE_PARTS),
  title: z.string().max(200).default(""),
  text: z.string().max(400).optional(),
  say: z.string().max(200).optional(),
  emoji: z.string().max(32).optional(),
  notes: z.string().max(1000).optional(),
  harder: z
    .object({ title: z.string().max(200).optional(), text: z.string().max(400).optional(), say: z.string().max(200).optional() })
    .nullable()
    .optional(),
  image: z.string().max(120).optional(),
  removeImage: z.boolean().optional(),
});

const CardIn = z.object({
  topic: z.string().max(60).optional(),
  goal: z.string().max(140).optional(),
  words: z.array(z.string().max(24)).max(8).optional(),
  status: z.enum(["planned", "done", "moved"]).optional(),
  plannedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  slides: z.array(SlideIn).max(30).optional(),
  packed: z.boolean().optional(),
  mark: z.enum(["worked", "not", "none"]).optional(),
});

/** Same words on screen and in the notes: not a change worth keeping on a rebuild. */
function sameSlide(a: Slide, b: Omit<Slide, "id">): boolean {
  const keys = ["part", "title", "text", "say", "emoji", "notes", "image"] as const;
  return keys.every((k) => (a[k] ?? "") === (b[k] ?? "")) && JSON.stringify(a.harder ?? null) === JSON.stringify(b.harder ?? null);
}

/** The tutor's edits: card fields, or the whole slide list from the editor. */
export async function PATCH(request: Request, { params }: Params) {
  const { id, cardId } = await params;
  const found = await planFor(id);
  if (!found) return NextResponse.json({ error: "No such plan." }, { status: 404 });
  const before = found.plan.cards.find((c) => c.id === cardId);
  if (before && !(await storyCardOpen(found.plan, before))) {
    return NextResponse.json({ error: "No such lesson." }, { status: 404 });
  }
  const raw = await readJson<unknown>(request, LIMIT.medium);
  if (raw instanceof Response) return raw;
  const parsed = CardIn.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "Check the lesson's fields." }, { status: 400 });
  const body = parsed.data;

  const result = await updateCard(id, cardId, (card) => {
    const patch: Partial<PlanCard> = {};
    if (body.topic !== undefined) patch.topic = body.topic.trim() || card.topic;
    if (body.goal !== undefined) patch.goal = body.goal.trim();
    if (body.words) {
      patch.words = body.words.map((w) => w.trim()).filter(Boolean).slice(0, 6);
    }
    if (body.status) patch.status = body.status;
    if (body.mark) {
      patch.mark = body.mark === "none" ? undefined : body.mark;
      // A note for the library, not a change to the lesson.
      if (Object.keys(body).length === 1) patch.updatedAt = card.updatedAt;
    }
    if (body.plannedDate !== undefined) patch.plannedDate = body.plannedDate ?? undefined;
    if (body.packed) {
      patch.packAt = new Date().toISOString();
      // Saving the pack is not a change to the lesson.
      if (Object.keys(body).length === 1) patch.updatedAt = card.updatedAt;
    }
    if (body.slides && card.materials) {
      const before = new Map(card.materials.slides.map((s) => [s.id, s]));
      // A picture can only be one this lesson already has: never a path or a
      // file of somebody else's.
      const ownImages = new Set(card.materials.slides.map((s) => s.image).filter(Boolean));
      const now = new Date().toISOString();
      const slides: Slide[] = [];
      for (const s of body.slides) {
        const clean = cleanSlide({ ...s, title: s.title || "" });
        if (!clean) continue;
        const old = s.id ? before.get(s.id) : undefined;
        const image = s.removeImage ? undefined : s.image && ownImages.has(s.image) ? s.image : old?.image;
        const next = { ...clean, picture: old?.picture, ...(image && { image }) };
        if (old && sameSlide(old, next)) slides.push(old);
        else slides.push({ id: old?.id ?? randomUUID(), ...next, editedAt: now });
      }
      patch.materials = { ...card.materials, slides };
    }
    return patch;
  });
  if (!result) return NextResponse.json({ error: "No such lesson." }, { status: 404 });
  // A Bible story marked taught moves the children's place in the programme,
  // the same one the homework follows.
  const story = storyFor(result.card.story?.storyId);
  if (story && body.status === "done" && before?.status !== "done") {
    await recordLiveStory((await studentsOf(result.plan)).students, story);
  }
  return NextResponse.json(result.card);
}

/** Remove a card, and its pictures unless another card still shows them. */
export async function DELETE(_request: Request, { params }: Params) {
  const { id, cardId } = await params;
  const found = await planFor(id);
  if (!found) return NextResponse.json({ error: "No such plan." }, { status: 404 });
  let removed: PlanCard | undefined;
  await updatePlan(id, (current) => {
    removed = current.cards.find((c) => c.id === cardId);
    return removed ? { cards: current.cards.filter((c) => c.id !== cardId) } : null;
  });
  if (!removed) return NextResponse.json({ error: "No such lesson." }, { status: 404 });
  const stillUsed = new Set(
    (await listPlans(found.plan.tutorId)).flatMap((p) =>
      p.cards.flatMap((c) => [
        ...(c.materials?.slides ?? []).map((s) => s.image),
        ...(c.materials?.sheets ?? []).map((s) => s.image),
      ]),
    ),
  );
  const mine = [
    ...(removed.materials?.slides ?? []).map((s) => s.image),
    ...(removed.materials?.sheets ?? []).map((s) => s.image),
  ];
  await Promise.all(mine.filter((n) => n && !stillUsed.has(n)).map((n) => deletePlanImage(n)));
  return NextResponse.json({ ok: true });
}
