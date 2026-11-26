import { gameScore, homeworkDone } from "./homework";
import { pickForReview, withIds } from "./memory";
import { effectiveMode, scheduleView } from "./schedule";
import type { LearningPolicy, Lesson, ScheduleEvent, Student } from "./types";

/**
 * Everything about a learner's practice between lessons, in one place for
 * the tutor: the schedule and what comes next, what waits for them, what the
 * child is doing, how it went lately, and what is worth going over.
 */
export type LearningOverview = {
  status: string;
  next: string | null;
  waiting: { id: string; title: string }[];
  current: { id: string; title: string; played: number; games: number }[];
  done: { id: string; title: string; score: string | null }[];
  heldBack: ScheduleEvent[];
  failed: ScheduleEvent[];
  recommended: { topic: string; why: string }[];
  briefStale: boolean;
};

const DAY = 86_400_000;

export function learningOverview(student: Student, lessons: Lesson[], now = Date.now(), policy?: LearningPolicy | null): LearningOverview {
  const { schedule, next } = scheduleView(student.schedule, now, policy);
  const live = lessons.filter((l) => l.review && !(l.review.state === "skipped" || l.review.state === "archived"));
  const status = !student.schedule?.enabled
    ? "Schedule off - Smart Reviews only when you make one."
    : schedule.pausedAt
      ? "Schedule paused."
      : schedule.mode === "manual"
        ? "Schedule on, made only when you ask."
        : `Schedule on - ${effectiveMode(schedule, policy, student.profile?.learning?.approval) === "auto" ? "sent by itself" : "made ahead for you to approve"}, at most ${schedule.maxPerWeek} a week.`;
  const recentLog = (schedule.log ?? []).filter((e) => now - Date.parse(e.at) < 14 * DAY);
  const evidenceAt = withIds(student.skills).flatMap((s) => (s.evidence ?? []).map((e) => e.at)).sort().at(-1);
  return {
    status,
    next: student.schedule?.enabled ? next : null,
    waiting: live.filter((l) => l.homework?.exercises?.length && !l.homework.sentAt).map((l) => ({ id: l.id, title: l.title })),
    current: live
      .filter((l) => l.homework?.sentAt && !homeworkDone(l.homework))
      .map((l) => ({ id: l.id, title: l.title, played: l.homework?.results?.length ?? 0, games: l.homework?.exercises?.length ?? 0 })),
    done: live
      .filter((l) => homeworkDone(l.homework))
      .slice(0, 3)
      .map((l) => {
        const s = gameScore(l.homework);
        return { id: l.id, title: l.title, score: s.total ? `${s.right}/${s.total} right` : null };
      }),
    heldBack: recentLog.filter((e) => e.outcome === "deferred" || e.outcome === "skipped").slice(-3).reverse(),
    failed: recentLog.filter((e) => e.outcome === "failed").slice(-2).reverse(),
    recommended: pickForReview(student.skills, { minutes: 15 }).slice(0, 3).map((p) => ({ topic: p.skill.topic, why: p.why })),
    briefStale: Boolean(student.brief && evidenceAt && evidenceAt > (student.brief.upTo ?? student.brief.at)),
  };
}

/** One tutor's practice between lessons over four weeks, for the agency's owner. */
export type TutorEngagement = {
  tutorId: string;
  learners: number;
  scheduled: number;
  paused: number;
  reviewsMade: number;
  reviewsSent: number;
  reviewsDone: number;
  waiting: number;
  homeworkSent: number;
  homeworkDone: number;
};

export function tutorEngagement(tutorId: string, students: Student[], lessons: Lesson[], now = Date.now()): TutorEngagement {
  const mine = new Set(students.map((s) => s.id));
  const recent = lessons.filter((l) => mine.has(l.studentId) && now - Date.parse(l.createdAt) < 28 * DAY);
  const reviews = recent.filter((l) => l.review && l.review.state !== "archived" && l.review.state !== "skipped");
  const homework = recent.filter((l) => !l.review && l.homework?.sentAt);
  return {
    tutorId,
    learners: students.length,
    scheduled: students.filter((s) => s.schedule?.enabled && !s.schedule.pausedAt).length,
    paused: students.filter((s) => s.schedule?.enabled && s.schedule.pausedAt).length,
    reviewsMade: reviews.length,
    reviewsSent: reviews.filter((l) => l.homework?.sentAt).length,
    reviewsDone: reviews.filter((l) => homeworkDone(l.homework)).length,
    waiting: reviews.filter((l) => l.homework?.exercises?.length && !l.homework.sentAt).length,
    homeworkSent: homework.length,
    homeworkDone: homework.filter((l) => homeworkDone(l.homework)).length,
  };
}
