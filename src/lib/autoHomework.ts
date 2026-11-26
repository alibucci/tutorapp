import { after } from "next/server";
import { cardById } from "./christianity";
import { labelSpeakers } from "./diarize";
import { buildExercises } from "./exercises";
import { sentStyle, styleFor } from "./gameStyles";
import { homeworkDone, sendsItself } from "./homework";
import { writeParentMessage } from "./parentMessage";
import { getLesson, getStudent, updateLesson } from "./store";
import { summarizeLesson } from "./summarize";
import { recordCovered, runPlanCheck } from "./planCheck";
import { markUsed, redoFor } from "./redo";
import { withUsage } from "./usage";
import type { Homework, Lesson, Student } from "./types";

/**
 * Homework goes out by itself.
 *
 * Once the tutor's debrief is in, the server writes the summary, builds the
 * games from the lesson's mistakes and sends them to the child - whether or
 * not the tutor ever opens the review page. The tutor keeps the corrections:
 * build different ones before the child starts, take it back, edit the tip.
 *
 * The same for every kind of homework, programme items (Bible stories) too;
 * see programmes.ts for how a programme's next item starts by itself.
 *
 * What it never does: send content whose card is not approved, send to an
 * archived student, or send again something the tutor took back - from then
 * on that homework is theirs to send.
 */

export type Outcome<T> = { ok: true; value: T } | { ok: false; error: string; status: number };

const fail = (error: string, status: number) => ({ ok: false as const, error, status });

/**
 * Work in progress, by key. A second request for the same lesson - the tutor
 * opening the page while the server is already on it - waits for the first
 * instead of paying for a second. On globalThis so every route bundle shares
 * the one map; in-process, which is right for one server.
 */
const jobs: Map<string, Promise<unknown>> = ((globalThis as { __aloudliJobs?: Map<string, Promise<unknown>> })
  .__aloudliJobs ??= new Map());

function once<T>(key: string, run: () => Promise<T>): Promise<T> {
  const running = jobs.get(key) as Promise<T> | undefined;
  if (running) return running;
  const job = run().finally(() => jobs.delete(key));
  jobs.set(key, job);
  return job;
}

// ---------------------------------------------------------------- summary

/**
 * Write the summary and the parent message. By student too: a lesson just
 * moved must not wait for, and be handed, the summary still being written
 * about the child it was moved away from.
 */
export function summarizeOnce(id: string, lesson: Lesson, student: Student): Promise<Outcome<Lesson | null>> {
  return once(`summary:${id}:${student.id}`, () => writeSummary(id, lesson, student));
}

async function writeSummary(id: string, lesson: Lesson, student: Student): Promise<Outcome<Lesson | null>> {
  if (!lesson.transcript.length && !lesson.debrief.length) {
    return fail("Nothing to summarise yet - record a lesson or a debrief.", 400);
  }
  try {
    // Speaker labels only mean something when the student is in the same room
    // as the microphone. Online, their voice comes out of a speaker and the
    // browser's echo cancellation removes most of it, so the labels would be
    // noise. Skipping it there also saves a whole model call.
    // A child's lesson from a group already says who spoke: the tutor checked it.
    const inRoom = lesson.capture === "both" && lesson.mode === "classroom" && !lesson.groupId;
    let working = lesson;
    if (inRoom && lesson.transcript.length) {
      working = { ...lesson, transcript: await labelSpeakers(lesson.transcript) };
    }

    // Independent of each other, so they run side by side.
    const [summary, parentMessage] = await Promise.all([
      summarizeLesson(working, student),
      // A tutor's edited message is theirs; regenerating must not overwrite it.
      lesson.parentMessage?.editedAt
        ? Promise.resolve(lesson.parentMessage)
        : withUsage({ purpose: "parent_message" }, () => writeParentMessage(working, student)),
      // Taught from a plan: what of it the lesson reached. Its own record; it
      // never holds up or fails the summary.
      lesson.planCard && !lesson.groupId ? runPlanCheck(id) : Promise.resolve(null),
    ]);

    // Decided against the record as it is now, under its lock: the tutor may
    // have edited the message meanwhile, or moved the lesson to another child.
    const saved = await updateLesson(id, (current) =>
      current.studentId !== student.id
        ? null
        : {
            ...(working.transcript !== lesson.transcript && { transcript: working.transcript }),
            summary,
            parentMessage: current.parentMessage?.editedAt ? current.parentMessage : parentMessage,
          },
    );
    if (saved) await recordCovered(saved, summary.covered).catch(() => {});
    return { ok: true, value: saved };
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Summary failed.", 502);
  }
}

// ---------------------------------------------------------------- games

/** Build the practice games from what the child got wrong (not a programme story). */
export function buildGamesOnce(id: string, lesson: Lesson, student: Student): Promise<Outcome<Homework | undefined>> {
  return once(`games:${id}:${student.id}`, () => buildGames(id, lesson, student));
}

async function buildGames(id: string, lesson: Lesson, student: Student): Promise<Outcome<Homework | undefined>> {
  try {
    // The tutor's "Practise these next time", read fresh: the student passed
    // in may be from before it was tapped.
    const redo = redoFor((await getStudent(student.id)) ?? student, id);
    const exercises = await buildExercises(lesson, student, redo);
    if (exercises.length === 0) return fail("Could not build usable games from this lesson. Try again.", 502);
    let built = false;
    const updated = await updateLesson(id, (current) => {
      // Started by the child since: what they are playing stays as it is.
      if (current.homework?.answers || current.homework?.results?.length || current.studentId !== student.id) return null;
      const homework = current.homework ?? { focus: current.summary?.homeworkFocus ?? "" };
      built = true;
      const next = { ...homework, exercises };
      if (redo.length) next.redo = redo.length;
      else delete next.redo;
      return { homework: next };
    });
    if (built) await markUsed(student.id, id, redo);
    return { ok: true, value: updated?.homework };
  } catch (e) {
    console.error("[exercises]", e);
    return fail(e instanceof Error ? e.message : "Could not build the games.", 502);
  }
}

// ---------------------------------------------------------------- sending

/** The homework as sent, or why it cannot go. Used by the tutor's Send and by the pipeline. */
export function markSent(current: Lesson, student: Student): { homework: Homework } | { error: string; status: number } {
  const homework: Homework = { ...(current.homework ?? { focus: current.summary?.homeworkFocus ?? "" }) };
  if (!homework.imageFile && !homework.exercises?.length) {
    return { error: "Add a picture or build the games before sending.", status: 400 };
  }
  // A story reaches a child only once its card is approved.
  if (current.module && !cardById(current.module.storyId)?.approved) {
    return {
      error: "This story's card is not approved yet, so it cannot be sent. You can still preview it.",
      status: 409,
    };
  }
  homework.sentAt ??= new Date().toISOString();
  delete homework.takenBackAt;
  // The look it goes out in stays with it: a profile changed next week
  // changes the next homework, not this one.
  homework.style ??= sentStyle(styleFor(student));
  return { homework };
}

// ---------------------------------------------------------------- the pipeline

/** Whether this lesson's homework is the server's to make and send now. */
export function autoApplies(lesson: Lesson, student: Pick<Student, "archivedAt">): boolean {
  if (student.archivedAt || !sendsItself(lesson)) return false;
  // A group lesson becomes each child's own; theirs go out, not it.
  if (lesson.kind === "group") return false;
  const homework = lesson.homework;
  if (homework?.sentAt || homework?.takenBackAt || homework?.answers || homeworkDone(homework)) return false;
  // Extra homework is built from the tutor's request; a lesson from its summary,
  // which is only written once the debrief is in.
  return lesson.kind === "practice" || Boolean(lesson.summary) || lesson.debrief.length > 0;
}

/**
 * Summary, games, send - whichever are still missing. Safe to call any number
 * of times: it joins a run in progress, and does nothing once it has gone out.
 */
export function runAutoHomework(id: string): Promise<Outcome<Homework | undefined>> {
  return once(`auto:${id}`, () => pipeline(id));
}

async function pipeline(id: string): Promise<Outcome<Homework | undefined>> {
  let lesson = await getLesson(id);
  const student = lesson ? await getStudent(lesson.studentId) : null;
  if (!lesson || !student) return fail("No such lesson.", 404);
  if (!autoApplies(lesson, student)) return { ok: true, value: lesson.homework };
  // Whose the calls below are. Extra homework is told apart from a lesson's
  // own: it is priced as a thing of its own.
  const who = { lessonId: id, studentId: student.id, tutorId: student.tutorId };
  const games = lesson.kind === "practice" ? "extra_homework" : "lesson_homework";

  const failed = async (error: string, status: number) => {
    console.error(`[auto] lesson ${id}: ${error}`);
    await updateLesson(id, (current) =>
      current.homework?.sentAt ? null : { autoFailed: { at: new Date().toISOString(), error } },
    );
    return fail(error, status);
  };

  if (!lesson.summary && lesson.kind !== "practice") {
    const current = lesson;
    const written = await withUsage({ purpose: "lesson_summary", ...who }, () => summarizeOnce(id, current, student));
    if (!written.ok) return failed(written.error, written.status);
    if (!written.value) return fail("This lesson changed in the meantime.", 409);
    lesson = written.value;
  }

  // A programme item is built with its lesson, from its card, and checked
  // there; a lesson's own games could not stand in for it.
  if (lesson.module && !lesson.homework?.exercises?.length) {
    return failed("This item was not built. Build it again from the student's page.", 409);
  }
  if (!lesson.homework?.exercises?.length) {
    const current = lesson;
    const built = await withUsage({ purpose: games, ...who }, () => buildGamesOnce(id, current, student));
    if (!built.ok) return failed(built.error, built.status);
  }

  let problem: { error: string; status: number } | null = null;
  const sent = await updateLesson(id, (current) => {
    // Decided again under the lock: the tutor may have sent, taken back or
    // moved it while the model was working.
    if (current.studentId !== student.id || !autoApplies(current, student)) return null;
    const result = markSent(current, student);
    if ("error" in result) {
      problem = result;
      return null;
    }
    return { homework: result.homework, autoFailed: undefined };
  });
  if (problem) {
    const { error, status } = problem;
    return failed(error, status);
  }
  if (sent?.homework?.sentAt) console.log(`[auto] lesson ${id}: homework sent`);
  return { ok: true, value: (sent ?? (await getLesson(id)))?.homework };
}

/**
 * Run the pipeline for these lessons once the response has gone. The tutor's
 * request returns straight away; the work goes on even if they lock the phone.
 * One after another, so a group of three is not three model calls at once.
 */
export function autoHomeworkAfter(...ids: string[]): void {
  if (!ids.length) return;
  after(async () => {
    for (const id of ids) {
      await runAutoHomework(id).catch((e) => console.error(`[auto] lesson ${id}:`, e));
    }
  });
}
