import { gameScore, homeworkDone } from "./homework";
import { pickForReview, withIds } from "./memory";
import { scheduleView } from "./schedule";
import type { Lesson, ScheduleEvent, Student } from "./types";

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

export function learningOverview(student: Student, lessons: Lesson[], now = Date.now()): LearningOverview {
  const { schedule, next } = scheduleView(student.schedule, now);
  const live = lessons.filter((l) => l.review && !(l.review.state === "skipped" || l.review.state === "archived"));
  const status = !student.schedule?.enabled
    ? "Schedule off - Smart Reviews only when you make one."
    : schedule.pausedAt
      ? "Schedule paused."
      : schedule.mode === "manual"
        ? "Schedule on, made only when you ask."
        : `Schedule on - ${schedule.mode === "auto" && !student.profile?.learning?.approval ? "sent by itself" : "made ahead for you to approve"}, at most ${schedule.maxPerWeek} a week.`;
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
