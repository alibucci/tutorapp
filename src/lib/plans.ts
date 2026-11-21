import { randomUUID } from "crypto";
import { after } from "next/server";
import { getSession, type Session } from "./auth";
import { interestsOf } from "./exercises";
import { asMaterials, buildMaterials, rebuildSlide, suggestMonth, type Learner } from "./lessonPlan";
import {
  getGroup,
  getPlan,
  getStudent,
  listLessons,
  listPlans,
  updatePlan,
} from "./store";
import { drawForCard, dropUnused, picturesOn } from "./planImages";
import { buildStorySlides, storyFor, storyOpen } from "./storySlides";
import { plansOpenTo } from "./tutorList";
import type { LessonPlan, PlanCard, Student, StudentGroup } from "./types";

/**
 * Lesson plans: who may see one, who it is for, and the slow work of writing
 * them, which runs after the request that asked for it has answered.
 */

export const DURATIONS = [30, 45, 60] as const;
export const MONTH_DEFAULT = 8;
export const MONTH_MAX = 12;
/** A board holds at most this many cards: past and future. */
export const CARDS_MAX = 60;

/** The plan, for the tutor who owns it and is on the release list. */
export async function planFor(id: string): Promise<{ session: Session; plan: LessonPlan } | null> {
  const session = await getSession();
  if (session?.role !== "tutor") return null;
  const plan = await getPlan(id);
  if (!plan || plan.tutorId !== session.id) return null;
  if (!(await plansOpenTo(session.id))) return null;
  return { session, plan };
}

/** The children a plan is for: one, or a saved group's. Archived ones are left out. */
export async function studentsOf(plan: Pick<LessonPlan, "studentId" | "groupId">): Promise<{
  students: Student[];
  group?: StudentGroup;
}> {
  if (plan.studentId) {
    const s = await getStudent(plan.studentId);
    return { students: s && !s.archivedAt ? [s] : [] };
  }
  const group = plan.groupId ? await getGroup(plan.groupId) : null;
  if (!group) return { students: [] };
  const all = await Promise.all(group.studentIds.map((id) => getStudent(id)));
  return { students: all.filter((s): s is Student => Boolean(s && !s.archivedAt)), group };
}

/** A plan's display name: the child's, or the group's. */
export async function planName(plan: LessonPlan): Promise<string> {
  const { students, group } = await studentsOf(plan);
  return group?.name ?? students[0]?.name ?? "Plan";
}

export async function learnersOf(students: Student[]): Promise<Learner[]> {
  return Promise.all(
    students.map(async (s) => ({
      age: s.profile?.age,
      level: s.profile?.level,
      interests: [s.profile?.about ?? "", await interestsOf(s)].filter(Boolean).join(" "),
    })),
  );
}

/**
 * Topics the children have already had: what their lessons covered, and what
 * is already on the board. A new plan does not repeat them.
 */
export async function topicsHad(plan: LessonPlan, students: Student[]): Promise<string[]> {
  const fromLessons = (
    await Promise.all(students.map((s) => listLessons(s.id)))
  ).flatMap((lessons) => lessons.flatMap((l) => l.summary?.covered ?? []));
  const fromBoard = plan.cards.flatMap((c) => [c.topic, ...(c.covered ?? [])]);
  return [...new Set([...fromLessons, ...fromBoard].map((t) => t.trim()).filter(Boolean))].slice(-60);
}

/** The active plan for a child or a group, if there is one. */
export async function activePlan(tutorId: string, who: { studentId?: string; groupId?: string }) {
  return (await listPlans(tutorId)).find(
    (p) =>
      !p.archivedAt &&
      ((who.studentId && p.studentId === who.studentId) || (who.groupId && p.groupId === who.groupId)),
  );
}

export function newCard(fields: Partial<PlanCard> & Pick<PlanCard, "topic">): PlanCard {
  return {
    id: randomUUID(),
    words: [],
    goal: "",
    source: "tutor",
    status: "planned",
    updatedAt: new Date().toISOString(),
    ...fields,
  };
}

/** The first card not yet taught: what the board marks "today". */
export function todayCard(plan: LessonPlan): PlanCard | undefined {
  return plan.cards.find((c) => c.status === "planned");
}

/** Change one card under the plan's lock. Null when the card is gone. */
export async function updateCard(
  planId: string,
  cardId: string,
  change: (card: PlanCard, plan: LessonPlan) => Partial<PlanCard> | null,
): Promise<{ plan: LessonPlan; card: PlanCard } | null> {
  let result: PlanCard | undefined;
  const plan = await updatePlan(planId, (current) => {
    const card = current.cards.find((c) => c.id === cardId);
    if (!card) return null;
    const patch = change(card, current);
    if (!patch) {
      result = card;
      return null;
    }
    // A patch may keep updatedAt as it was: saving the pack is not an edit.
    result = { ...card, updatedAt: new Date().toISOString(), ...patch, id: card.id };
    return { cards: current.cards.map((c) => (c.id === cardId ? result! : c)) };
  });
  return plan && result ? { plan, card: result } : null;
}

// ---------------------------------------------------------------------------
// Work in the background
// ---------------------------------------------------------------------------

const jobs = new Map<string, Promise<unknown>>();

/** One job per key at a time: a second tap joins the first. */
function once(key: string, run: () => Promise<unknown>): void {
  if (jobs.has(key)) return;
  const job = run()
    .catch((e) => console.error(`[plans] ${key}`, e))
    .finally(() => jobs.delete(key));
  jobs.set(key, job);
}

/** A marker older than this was left by a server that restarted mid-job. */
const STALE_MS = 6 * 60_000;

export function isBuilding(card: PlanCard): boolean {
  return Boolean(card.building && Date.now() - Date.parse(card.building.since) < STALE_MS);
}

export function isSuggesting(plan: LessonPlan): boolean {
  return Boolean(plan.suggesting && Date.now() - Date.parse(plan.suggesting.since) < STALE_MS);
}

function message(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong. Try again.";
}

/** Suggest `count` more cards, after the request has answered. */
export async function startMonth(plan: LessonPlan, count: number): Promise<LessonPlan | null> {
  const marked = await updatePlan(plan.id, { suggesting: { since: new Date().toISOString() }, suggestError: undefined });
  after(() =>
    once(`month:${plan.id}`, async () => {
      try {
        const fresh = (await getPlan(plan.id)) ?? plan;
        const { students } = await studentsOf(fresh);
        const cards = await suggestMonth({
          learners: await learnersOf(students),
          count,
          minutes: fresh.durationMinutes,
          parentWishes: fresh.parentWishes,
          had: await topicsHad(fresh, students),
        });
        await updatePlan(plan.id, (current) => ({
          cards: [
            ...current.cards,
            ...cards.map((c) => newCard({ ...c, source: "ai" })),
          ].slice(0, CARDS_MAX),
          suggesting: undefined,
        }));
      } catch (e) {
        await updatePlan(plan.id, { suggesting: undefined, suggestError: message(e) });
      }
    }),
  );
  return marked;
}

/**
 * Write a card's materials, after the request has answered. A rebuild keeps
 * the slides the tutor changed by hand where they are.
 */
export async function startBuild(
  planId: string,
  cardId: string,
  opts: { wish?: string; keepEdited?: boolean } = {},
): Promise<PlanCard | null> {
  const marked = await updateCard(planId, cardId, () => ({
    building: { since: new Date().toISOString(), step: "Writing the slides" },
    buildError: undefined,
  }));
  if (!marked) return null;
  after(() =>
    once(`build:${cardId}`, async () => {
      try {
        const plan = await getPlan(planId);
        const card = plan?.cards.find((c) => c.id === cardId);
        if (!plan || !card) return;
        const { students } = await studentsOf(plan);
        if (card.story) {
          await buildStoryCard(plan, card, students);
          return;
        }
        const current = card.materials?.slides ?? [];
        const keep = opts.keepEdited === false
          ? []
          : current.flatMap((slide, index) => (slide.editedAt ? [{ index, slide }] : []));
        const built = await buildMaterials({
          learners: await learnersOf(students),
          minutes: plan.durationMinutes,
          card,
          parentWishes: plan.parentWishes,
          had: (await topicsHad(plan, students)).filter((t) => t !== card.topic),
          wish: opts.wish,
          keep,
          current: opts.wish ? current : undefined,
        });
        const old = card.materials;
        const drawing = picturesOn();
        const ages = students.map((x) => x.profile?.age).filter((n): n is number => typeof n === "number");
        await updateCard(planId, cardId, () => ({
          audience: { ages, ...(students[0]?.profile?.level && { level: students[0].profile.level }) },
          visibility: "private",
          topic: built.topic,
          words: built.words,
          goal: built.goal,
          materials: asMaterials(built, opts.wish),
          // The slides are there and usable; pictures follow where drawing is on.
          building: drawing ? { since: new Date().toISOString(), step: "Drawing pictures" } : undefined,
        }));
        await dropUnused(plan.tutorId, old);
        if (drawing) {
          await drawForCard(planId, cardId).catch((e) => console.error("[plan images]", e));
          await updateCard(planId, cardId, () => ({ building: undefined }));
        }
      } catch (e) {
        await updateCard(planId, cardId, () => ({ building: undefined, buildError: message(e) }));
      }
    }),
  );
  return marked.card;
}

/** One slide again, in the request: a single call, well under a minute. */
export async function remakeSlide(plan: LessonPlan, card: PlanCard, slideId: string, wish: string) {
  const slides = card.materials?.slides ?? [];
  const index = slides.findIndex((s) => s.id === slideId);
  if (index < 0) return null;
  const { students } = await studentsOf(plan);
  const slide = await rebuildSlide({ learners: await learnersOf(students), card, slides, index, wish });
  return updateCard(plan.id, card.id, (now) =>
    now.materials
      ? {
          materials: {
            ...now.materials,
            slides: now.materials.slides.map((s) => (s.id === slideId ? slide : s)),
          },
        }
      : null,
  );
}

/**
 * A lesson about to start from a plan card: the card must be this tutor's,
 * and the plan must be for the same child or group the lesson is for.
 * Null when it does not fit - the lesson then starts without a plan.
 */
export async function cardForLesson(
  tutorId: string,
  ref: unknown,
  who: { studentId?: string; studentIds?: string[] },
): Promise<{ planId: string; cardId: string; storyId?: string } | null> {
  if (!ref || typeof ref !== "object") return null;
  const { planId, cardId } = ref as { planId?: unknown; cardId?: unknown };
  if (typeof planId !== "string" || typeof cardId !== "string") return null;
  if (!(await plansOpenTo(tutorId))) return null;
  const plan = await getPlan(planId);
  if (!plan || plan.tutorId !== tutorId || plan.archivedAt) return null;
  const card = plan.cards.find((c) => c.id === cardId);
  if (!card) return null;
  if (who.studentId) {
    if (plan.studentId !== who.studentId) return null;
  } else {
    const group = plan.groupId ? await getGroup(plan.groupId) : null;
    // A child may be away: the lesson's children are some of the group's.
    if (!group || !who.studentIds?.length || !who.studentIds.every((id) => group.studentIds.includes(id))) return null;
  }
  if (card.story) {
    const kids = (await Promise.all((who.studentIds ?? [who.studentId!]).map((id) => getStudent(id)))).filter(
      (s): s is Student => Boolean(s),
    );
    if (!(await storyOpen(tutorId, kids))) return null;
    return { planId, cardId, storyId: card.story.storyId };
  }
  return { planId, cardId };
}

/** The card now has a lesson taught from it. */
export async function linkLesson(ref: { planId: string; cardId: string }, lessonId: string) {
  await updateCard(ref.planId, ref.cardId, () => ({ lessonId }));
}

/** A new picture for one slide, after the request has answered. */
export async function startRedraw(plan: LessonPlan, card: PlanCard, slideId: string): Promise<boolean> {
  const slide = card.materials?.slides.find((s) => s.id === slideId);
  if (!slide?.picture || !picturesOn()) return false;
  const old = slide.image;
  await updateCard(plan.id, card.id, (c) =>
    c.materials
      ? {
          materials: { ...c.materials, slides: c.materials.slides.map((s) => (s.id === slideId ? { ...s, image: undefined } : s)) },
          building: { since: new Date().toISOString(), step: "Drawing a new picture" },
        }
      : null,
  );
  after(() =>
    once(`redraw:${slideId}`, async () => {
      await drawForCard(plan.id, card.id, slideId).catch((e) => console.error("[plan images]", e));
      await updateCard(plan.id, card.id, () => ({ building: undefined }));
      if (old) await dropUnused(plan.tutorId, { slides: [{ ...slide, image: old }], sheets: [], videos: [], builtAt: "" });
    }),
  );
  return true;
}

/**
 * A Bible story card: slides told from the card and checked by code, with the
 * ready-made drawings. No sheets of the model's, no videos, no pictures drawn.
 * Only while the track is open for every child the plan is for.
 */
async function buildStoryCard(plan: LessonPlan, card: PlanCard, students: Student[]): Promise<void> {
  const story = storyFor(card.story?.storyId);
  if (!story || !(await storyOpen(plan.tutorId, students))) {
    await updateCard(plan.id, card.id, () => ({ building: undefined, buildError: "The Christianity programme is not open for these children." }));
    return;
  }
  const ages = students.map((x) => x.profile?.age).filter((n): n is number => typeof n === "number");
  const slides = await buildStorySlides(story, ages);
  await updateCard(plan.id, card.id, () => ({
    topic: story.title,
    goal: `Today's good habit: ${story.value.rule}`,
    words: [],
    audience: { ages },
    materials: { slides, sheets: [], videos: [], builtAt: new Date().toISOString() },
    building: undefined,
  }));
}

/** A story card may be seen and used: the track is open for this plan's children. */
export async function storyCardOpen(plan: LessonPlan, card: PlanCard): Promise<boolean> {
  if (!card.story) return true;
  const { students } = await studentsOf(plan);
  return storyOpen(plan.tutorId, students);
}
