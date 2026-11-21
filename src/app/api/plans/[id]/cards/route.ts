import { NextResponse } from "next/server";
import { LIMIT, readJson } from "@/lib/http";
import { CARDS_MAX, MONTH_DEFAULT, MONTH_MAX, isSuggesting, newCard, planFor, startBuild, startMonth, studentsOf } from "@/lib/plans";
import { nextLiveStory, storyFor, storyOpen } from "@/lib/storySlides";
import { updatePlan } from "@/lib/store";
import type { PlanCard } from "@/lib/types";
import { randomUUID } from "crypto";

type Params = { params: Promise<{ id: string }> };

/**
 * Add to the board:
 * - `{ mode: "topic", topic? }`  one lesson on the tutor's topic (or one the
 *   model picks), with its slides written straight away;
 * - `{ mode: "month", count? }`  a month of cards suggested by the model;
 * - `{ mode: "blank" }`          an empty card to fill in by hand;
 * - `{ duplicate: cardId }`      a copy of a card, materials and all.
 */
export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const found = await planFor(id);
  if (!found) return NextResponse.json({ error: "No such plan." }, { status: 404 });
  const { plan } = found;
  const body = await readJson<{
    mode?: unknown;
    topic?: unknown;
    count?: unknown;
    duplicate?: unknown;
    copyFrom?: unknown;
    storyId?: unknown;
  }>(
    request,
    LIMIT.small,
  );
  if (body instanceof Response) return body;
  if (plan.cards.length >= CARDS_MAX) {
    return NextResponse.json({ error: `A plan holds at most ${CARDS_MAX} lessons. Archive it and start a new one.` }, { status: 409 });
  }

  if (body.mode === "month") {
    if (isSuggesting(plan)) return NextResponse.json(plan, { status: 202 });
    const count = Number(body.count ?? MONTH_DEFAULT);
    if (!Number.isInteger(count) || count < 1 || count > MONTH_MAX) {
      return NextResponse.json({ error: `From 1 to ${MONTH_MAX} lessons.` }, { status: 400 });
    }
    return NextResponse.json(await startMonth(plan, count), { status: 202 });
  }

  let card: PlanCard;
  // A Bible story for a live lesson: only while the track is open for every
  // child of this plan. The next one in the programme, or one the tutor picks.
  if (body.mode === "story") {
    const { students } = await studentsOf(plan);
    if (!(await storyOpen(plan.tutorId, students))) {
      return NextResponse.json({ error: "No such lesson." }, { status: 404 });
    }
    const story = typeof body.storyId === "string" ? storyFor(body.storyId) : nextLiveStory(students);
    if (!story) return NextResponse.json({ error: "The programme has no more stories." }, { status: 409 });
    card = newCard({ topic: story.title, goal: `Today's good habit: ${story.value.rule}`, story: { storyId: story.id } });
    await updatePlan(id, (current) => ({ cards: [...current.cards, card] }));
    return NextResponse.json((await startBuild(id, card.id)) ?? card, { status: 201 });
  }
  // From the library: a card of one of this tutor's plans, into this one.
  const copy = body.copyFrom as { planId?: unknown; cardId?: unknown } | undefined;
  const fromPlan =
    copy && typeof copy.planId === "string" && typeof copy.cardId === "string"
      ? copy.planId === id
        ? plan
        : (await planFor(copy.planId))?.plan
      : undefined;
  if (copy && !fromPlan) return NextResponse.json({ error: "No such lesson." }, { status: 404 });
  if (typeof body.duplicate === "string" || fromPlan) {
    const sourceId = fromPlan ? (copy!.cardId as string) : (body.duplicate as string);
    const source = (fromPlan ?? plan).cards.find((c) => c.id === sourceId);
    if (!source) return NextResponse.json({ error: "No such lesson." }, { status: 404 });
    // Bible stories stay out of the library: not copied into other plans.
    if (source.story && fromPlan && fromPlan.id !== id) {
      return NextResponse.json({ error: "Bible stories are not copied between plans." }, { status: 409 });
    }
    card = newCard({
      topic: source.topic,
      words: source.words,
      goal: source.goal,
      link: source.link,
      source: source.source,
      audience: source.audience,
      visibility: "private",
      ...(fromPlan && { copiedFrom: source.id }),
      ...(source.story && { story: source.story }),
      // Pictures are shared files: the copy points at the same ones.
      ...(source.materials && {
        materials: {
          ...source.materials,
          slides: source.materials.slides.map((s) => ({ ...s, id: randomUUID() })),
          sheets: source.materials.sheets.map((s) => ({ ...s, id: randomUUID() })),
        },
      }),
    });
  } else if (body.mode === "topic") {
    const topic = typeof body.topic === "string" ? body.topic.trim().slice(0, 60) : "";
    card = newCard({ topic, source: topic ? "tutor" : "ai" });
  } else if (body.mode === "blank") {
    card = newCard({ topic: "New lesson" });
  } else {
    return NextResponse.json({ error: "Say what to add." }, { status: 400 });
  }

  await updatePlan(id, (current) => {
    const at = typeof body.duplicate === "string" ? current.cards.findIndex((c) => c.id === body.duplicate) + 1 : current.cards.length;
    const cards = [...current.cards];
    cards.splice(at, 0, card);
    return { cards };
  });
  const started = body.mode === "topic" ? await startBuild(id, card.id) : card;
  return NextResponse.json(started ?? card, { status: 201 });
}
