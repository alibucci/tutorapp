import { markSent } from "./autoHomework";
import { homeworkDone } from "./homework";
import { noticeReviewWaiting } from "./notices";
import { makeSmartReview } from "./review";
import { type QueuedReview, decide, effectiveMode, logged } from "./schedule";
import { getLearningPolicy, getStudent, listLessons, listStudents, updateLesson, updateStudent } from "./store";
import { learningOpenTo } from "./tutorList";
import type { Lesson, ScheduleEvent } from "./types";

/**
 * The runner behind the learning schedule: every few minutes it asks each
 * scheduled learner's queue what to do (schedule.ts) and does it. Started
 * once per server from instrumentation.ts.
 *
 * A slot is claimed under the learner's lock before anything is made, so two
 * runs - or two server processes - never make the same review twice; and the
 * claim stands even if making it fails, so a failure is reported, not retried
 * into a pile.
 */

const EVERY_MS = 5 * 60_000;

export function queued(lesson: Lesson): QueuedReview {
  return {
    id: lesson.id,
    by: lesson.review?.by ?? "tutor",
    createdAt: lesson.createdAt,
    sent: Boolean(lesson.homework?.sentAt),
    done: homeworkDone(lesson.homework),
    setAside: Boolean(lesson.review?.state && lesson.review.state !== "deferred"),
  };
}

async function note(studentId: string, e: ScheduleEvent): Promise<void> {
  await updateStudent(studentId, (s) => (s.schedule ? { schedule: logged(s.schedule, e) } : null));
}

/** One learner: decide, claim the slot, act, write down what happened. */
export async function runSchedule(studentId: string, now = Date.now()): Promise<ScheduleEvent | null> {
  const student = await getStudent(studentId);
  const schedule = student?.schedule;
  if (!student || !schedule || student.archivedAt || !(await learningOpenTo(student.tutorId))) return null;
  const reviews = (await listLessons(studentId)).filter((l) => l.review).map(queued);
  const d = decide(schedule, reviews, now);
  if (d.kind === "wait") return null;

  let claimed = false;
  await updateStudent(studentId, (s) => {
    if (!s.schedule || (s.schedule.lastSlot && s.schedule.lastSlot >= d.slot.key)) return null;
    claimed = true;
    return { schedule: { ...s.schedule, lastSlot: d.slot.key } };
  });
  if (!claimed) return null;

  const at = new Date(now).toISOString();
  if (d.kind !== "make") {
    const e: ScheduleEvent = { slot: d.slot.key, at, outcome: d.kind === "skip" ? "skipped" : "deferred", reason: d.reason };
    await note(studentId, e);
    return e;
  }

  // Written now, from the newest results - not when the slot was planned.
  const made = await makeSmartReview(student, { minutes: schedule.minutes, by: "schedule", slot: d.slot.key });
  if ("error" in made || !made.built) {
    const e: ScheduleEvent = {
      slot: d.slot.key,
      at,
      outcome: "failed",
      ...("error" in made ? {} : { lessonId: made.lesson.id }),
      reason: "error" in made ? made.error : "The games could not be built. Open it to try again.",
    };
    await note(studentId, e);
    return e;
  }
  const lessonId = made.lesson.id;
  // The agency's policy and "I approve practice first" both override "sent by itself".
  if (effectiveMode(schedule, await getLearningPolicy(), student.profile?.learning?.approval) === "auto") {
    const sent = await updateLesson(lessonId, (current) => {
      const r = markSent(current, student);
      return "error" in r ? null : { homework: r.homework };
    });
    const e: ScheduleEvent = sent?.homework?.sentAt
      ? { slot: d.slot.key, at, outcome: "sent", lessonId, reason: "Made from the newest results and sent." }
      : { slot: d.slot.key, at, outcome: "failed", lessonId, reason: "Made, but could not be sent. Open it to send." };
    await note(studentId, e);
    return e;
  }
  noticeReviewWaiting(made.lesson);
  const e: ScheduleEvent = { slot: d.slot.key, at, outcome: "awaiting_approval", lessonId, reason: "Made from the newest results; waiting for you to check and send." };
  await note(studentId, e);
  return e;
}

/** Every learner with a schedule on, one at a time - a handful of model calls at most. */
export async function runSchedules(now = Date.now()): Promise<void> {
  const students = (await listStudents()).filter((s) => s.schedule?.enabled && !s.schedule.pausedAt && !s.archivedAt);
  for (const s of students) {
    await runSchedule(s.id, now).catch((e) => console.error("[schedule]", s.id, e));
  }
}

const started = globalThis as unknown as { __aloudliScheduler?: boolean };

/** Start the ticker, once per server process. */
export function startScheduler(): void {
  if (started.__aloudliScheduler || process.env.LEARNING_SCHEDULER === "off") return;
  started.__aloudliScheduler = true;
  let running = false;
  const tick = () => {
    if (running) return;
    running = true;
    void runSchedules()
      .catch((e) => console.error("[schedule]", e))
      .finally(() => (running = false));
  };
  setTimeout(tick, 60_000);
  setInterval(tick, EVERY_MS).unref?.();
}
