import { after } from "next/server";
import { type Outcome, runAutoHomework } from "./autoHomework";
import { StoryNotBuilt, buildStoryHomework, christianityOpenTo, moduleOf, nextStory } from "./christianity";
import { homeworkDone } from "./homework";
import { createLesson, getStudent, listLessons, updateLesson, updateStudent } from "./store";
import { DEFAULT_LANGUAGE, type Lesson, type Student } from "./types";

/**
 * Programmes: homework that comes as a series, one item after another (the
 * Bible stories today). They run by themselves like every other homework:
 * switched on for a learner, the first item is built and sent; each time the
 * learner finishes one, the next is built and sent - until the programme ends.
 *
 * What stays in place: a programme reaches a learner only while it is switched
 * on for them (with the parent's request ticked) and their tutor may use it,
 * and an item goes out only once its card is approved. One item at a time: the
 * next waits until the one in hand is finished.
 */

const CHRISTIANITY = "christianity";

/** The item the learner has not finished yet, if any. */
async function itemInHand(studentId: string, programme: string): Promise<Lesson | undefined> {
  const lessons = await listLessons(studentId);
  return lessons.find((l) => l.module?.id === programme && !homeworkDone(l.homework));
}

/** Whether the programme runs for this learner without anyone asking. */
async function running(student: Student): Promise<boolean> {
  if (student.archivedAt || !moduleOf(student)?.enabled) return false;
  // The tutor's own permission, checked as their session would be.
  return christianityOpenTo({ role: "tutor", id: student.tutorId, name: "" });
}

/** One start per learner at a time: a second call joins the first. */
const starts: Map<string, Promise<Outcome<string | null>>> = ((globalThis as {
  __aloudliProgrammeStarts?: Map<string, Promise<Outcome<string | null>>>;
}).__aloudliProgrammeStarts ??= new Map());

/**
 * Build the learner's next story and send it. Returns the lesson id, or null
 * when the programme is over. The story is checked against its card while it
 * is built; if that fails nothing is made, so there is never a half-built item.
 */
export function startNextStory(student: Student): Promise<Outcome<string | null>> {
  const key = student.id;
  const runningStart = starts.get(key);
  if (runningStart) return runningStart;
  const job = start(student).finally(() => starts.delete(key));
  starts.set(key, job);
  return job;
}

/** Remember on the learner that the next item did not go out, or that it did. */
async function note(studentId: string, error: string | null): Promise<void> {
  await updateStudent(studentId, (s) => {
    const state = s.modules?.christianity;
    if (!state || (!error && !state.failed)) return null;
    const next = { ...state };
    if (error) next.failed = { at: new Date().toISOString(), error };
    else delete next.failed;
    return { modules: { ...s.modules, christianity: next } };
  });
}

async function start(student: Student): Promise<Outcome<string | null>> {
  const result = await attempt(student);
  // A busy "one in hand" is not a failure; anything else is shown to the tutor.
  if (!result.ok && result.status !== 409) await note(student.id, result.error);
  if (result.ok) await note(student.id, null);
  return result;
}

async function attempt(student: Student): Promise<Outcome<string | null>> {
  const state = moduleOf(student);
  if (!state?.enabled) return { ok: false, error: "Christianity is not switched on for this learner.", status: 400 };

  const open = await itemInHand(student.id, CHRISTIANITY);
  if (open) {
    // Not gone yet (a failed send, say): send it rather than start another.
    if (!open.homework?.sentAt && !open.homework?.takenBackAt) {
      const sent = await runAutoHomework(open.id);
      if (!sent.ok) return sent;
      return { ok: true, value: open.id };
    }
    return {
      ok: false,
      error: `"${open.title}" is with ${student.name} now. The next story goes when it is finished.`,
      status: 409,
    };
  }

  const next = nextStory(state);
  if (!next) return { ok: true, value: null };

  try {
    const built = await buildStoryHomework(student, next.card, next.review);
    const now = new Date().toISOString();
    const lesson = await createLesson({
      title: next.card.title,
      kind: "practice",
      request: `Christianity · ${next.card.title} (${next.card.reference})`,
      module: {
        id: CHRISTIANITY,
        storyId: next.card.id,
        ...(next.review && { reviewOf: next.review.id }),
      },
      studentId: student.id,
      mode: "online",
      capture: "tutor",
      language: DEFAULT_LANGUAGE,
      startedAt: now,
      endedAt: now,
    });
    await updateLesson(lesson.id, { homework: built.homework, parentMessage: built.parentMessage });
    // A failed send is marked on the lesson itself (autoFailed) and shown there.
    const sent = await runAutoHomework(lesson.id);
    if (!sent.ok) console.error(`[programme] story ${lesson.id} built, not sent: ${sent.error}`);
    return { ok: true, value: lesson.id };
  } catch (e) {
    console.error("[christianity] build", e);
    const message = e instanceof StoryNotBuilt ? e.message : "Could not build it. Try again.";
    return { ok: false, error: message, status: 502 };
  }
}

/** Start whatever programme item is due for this learner, if it runs by itself. */
export async function continueProgrammes(studentId: string): Promise<void> {
  const student = await getStudent(studentId);
  if (!student || !(await running(student))) return;
  const result = await startNextStory(student);
  // Busy with the one in hand is the normal case, not a failure.
  if (!result.ok && result.status !== 409) console.error(`[programme] ${studentId}: ${result.error}`);
}

/** After the response: continue the learner's programmes. */
export function programmesAfter(studentId: string): void {
  after(() => continueProgrammes(studentId).catch((e) => console.error(`[programme] ${studentId}:`, e)));
}

/**
 * Just switched on by someone allowed to: start the item due now. (From then
 * on the chain needs the learner's own tutor to be allowed - see running.)
 */
export function startNextAfter(student: Student): void {
  after(async () => {
    const result = await startNextStory(student);
    if (!result.ok && result.status !== 409) console.error(`[programme] ${student.id}: ${result.error}`);
  });
}

/** A programme item has just been finished: the next one follows. */
export function onHomeworkDone(before: Lesson, current: Lesson | null): void {
  if (!current?.module || homeworkDone(before.homework) || !homeworkDone(current.homework)) return;
  programmesAfter(current.studentId);
}
