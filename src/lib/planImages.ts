import { PictureError, canDrawPictures, drawPictures } from "./imageGen";
import { deletePlanImage, getPlan, getTutor, listPlans, savePlanImage, updateTutor } from "./store";
import { updateCard } from "./plans";
import type { LessonMaterials, PlanCard } from "./types";

/**
 * Pictures for slides and colouring pages. Drawn once, when the lesson is
 * written, and kept as files. Drawing is paid for and sometimes refused, so:
 * - it runs only where the server has it switched on (HOMEWORK_PICTURE_AI);
 * - a lesson gets at most PLAN_IMAGES_PER_CARD pictures, a tutor at most
 *   PLAN_IMAGES_PER_MONTH a month;
 * - one picture at a time for the whole server (2 cores, 2 GB);
 * - a picture that fails is simply not there: the slide shows its emoji, the
 *   colouring page its word in outline. The lesson never waits for one.
 */

const PER_CARD = Number(process.env.PLAN_IMAGES_PER_CARD ?? 6);
const PER_MONTH = Number(process.env.PLAN_IMAGES_PER_MONTH ?? 150);

const SLIDE_STYLE = (picture: string) =>
  `A simple, friendly picture for young children learning English: ${picture}. Flat bright colours, clean shapes, plain background. No text, no letters, no numbers.`;
const COLORING_STYLE = (picture: string) =>
  `A black and white colouring page for young children: ${picture}. Thick clean black outlines on a white background, no shading, no colour, no text.`;

/** One drawing at a time across the server. */
let queue: Promise<unknown> = Promise.resolve();
function oneAtATime<T>(run: () => Promise<T>): Promise<T> {
  const next = queue.then(run, run);
  queue = next.catch(() => {});
  return next;
}

const thisMonth = () => new Date().toISOString().slice(0, 7);

/** A picture that was not drawn goes back to the month. */
async function refund(tutorId: string): Promise<void> {
  await updateTutor(tutorId, (t) =>
    t.planImages?.month === thisMonth() && t.planImages.count > 0
      ? { planImages: { month: thisMonth(), count: t.planImages.count - 1 } }
      : null,
  );
}

/** Take one picture from the tutor's month. False when the month is used up. */
async function spend(tutorId: string): Promise<boolean> {
  let allowed = false;
  await updateTutor(tutorId, (t) => {
    const used = t.planImages?.month === thisMonth() ? t.planImages.count : 0;
    if (used >= PER_MONTH) return null;
    allowed = true;
    return { planImages: { month: thisMonth(), count: used + 1 } };
  });
  return allowed;
}

export function picturesOn(): boolean {
  return canDrawPictures();
}

/** What still wants a picture on this card, in the order it is drawn. */
function wanted(m: LessonMaterials): { kind: "slide" | "sheet"; id: string; prompt: string }[] {
  const out: { kind: "slide" | "sheet"; id: string; prompt: string }[] = [];
  for (const sheet of m.sheets) {
    if (sheet.kind === "coloring" && sheet.picture && !sheet.image) {
      out.push({ kind: "sheet", id: sheet.id, prompt: COLORING_STYLE(sheet.picture) });
    }
  }
  for (const slide of m.slides) {
    if (slide.picture && !slide.image) out.push({ kind: "slide", id: slide.id, prompt: SLIDE_STYLE(slide.picture) });
  }
  const already = m.slides.filter((s) => s.image).length + m.sheets.filter((s) => s.image).length;
  return out.slice(0, Math.max(0, PER_CARD - already));
}

/**
 * Draw what the card's materials still lack, one by one, saving each as it
 * comes. `only` limits it to one slide (a picture asked for again).
 */
export async function drawForCard(planId: string, cardId: string, only?: string): Promise<void> {
  if (!canDrawPictures()) return;
  const plan = await getPlan(planId);
  const card = plan?.cards.find((c) => c.id === cardId);
  if (!plan || !card?.materials) return;
  const todo = wanted(card.materials).filter((w) => !only || w.id === only);
  for (let i = 0; i < todo.length; i++) {
    const item = todo[i];
    if (!(await spend(plan.tutorId))) {
      console.warn(`[plan images] ${plan.tutorId} has used this month's pictures`);
      break;
    }
    await updateCard(planId, cardId, (c) =>
      c.building ? { building: { since: new Date().toISOString(), step: `Drawing pictures (${i + 1} of ${todo.length})` } } : null,
    );
    let name: string | undefined;
    try {
      const [image] = await oneAtATime(() => drawPictures(item.prompt, 1));
      name = await savePlanImage(planId, image.data, image.ext);
    } catch (e) {
      // Refused or unreachable: this slide keeps its emoji, and the picture
      // is not counted against the month.
      console.warn("[plan images]", e instanceof PictureError ? e.message : e);
      await refund(plan.tutorId);
      // The service refuses this account outright: the rest would fail too.
      if (e instanceof Error && /AccessDenied|InvalidApiKey|not set up/i.test(e.message)) break;
      continue;
    }
    const saved = await updateCard(planId, cardId, (c) => {
      if (!c.materials) return null;
      const put = <T extends { id: string; image?: string }>(list: T[]) =>
        list.map((x) => (x.id === item.id ? { ...x, image: name } : x));
      return {
        materials: {
          ...c.materials,
          slides: item.kind === "slide" ? put(c.materials.slides) : c.materials.slides,
          sheets: item.kind === "sheet" ? put(c.materials.sheets) : c.materials.sheets,
        },
      };
    });
    // The slide went while it was drawn (deleted, or the lesson rebuilt).
    const landed = saved?.card.materials &&
      [...saved.card.materials.slides, ...saved.card.materials.sheets].some((x) => x.image === name);
    if (!landed) await deletePlanImage(name);
  }
}

/** Pictures the old materials had that nothing shows any more: deleted. */
export async function dropUnused(tutorId: string, old: LessonMaterials | undefined): Promise<void> {
  if (!old) return;
  const before = [...old.slides, ...old.sheets].map((x) => x.image).filter((n): n is string => Boolean(n));
  if (!before.length) return;
  const inUse = new Set(
    (await listPlans(tutorId)).flatMap((p: { cards: PlanCard[] }) =>
      p.cards.flatMap((c) => [...(c.materials?.slides ?? []), ...(c.materials?.sheets ?? [])].map((x) => x.image)),
    ),
  );
  await Promise.all(before.filter((n) => !inUse.has(n)).map((n) => deletePlanImage(n)));
}

/** Used by the admin view later; here so the cap has one reader. */
export async function picturesLeft(tutorId: string): Promise<number> {
  const t = await getTutor(tutorId);
  const used = t?.planImages?.month === thisMonth() ? t.planImages.count : 0;
  return Math.max(0, PER_MONTH - used);
}
