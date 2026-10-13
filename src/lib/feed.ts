import { gameScore, homeworkDone } from "./homework";
import type { Lesson, Student } from "./types";

/**
 * What the children have been doing, for the tutor's home.
 *
 * Built from the records themselves rather than a separate log: a child
 * handing homework in already leaves a timestamp, and a second copy of that
 * fact in an events table would be one more thing to keep true.
 *
 * One line per homework, not one per game. Three games finished is one piece
 * of news - "Yeva did her homework" - and a feed that says it three times is
 * a feed nobody reads.
 */
export type FeedEvent = {
  at: string;
  studentName: string;
  what: string;
  detail: string;
  href: string;
  /** Finished, rather than partway through. */
  done: boolean;
};

/** The last thing the child did on this homework, if they have started. */
function lastTouch(lesson: Lesson): string | null {
  const times = [
    ...(lesson.homework?.results ?? []).map((r) => r.finishedAt),
    lesson.homework?.answers?.submittedAt,
  ].filter((t): t is string => Boolean(t));
  return times.length ? times.sort().at(-1)! : null;
}

export function recentActivity(
  lessons: Lesson[],
  students: Student[],
  limit = 8,
): FeedEvent[] {
  const names = new Map(students.map((s) => [s.id, s.name]));
  const events: FeedEvent[] = [];

  for (const lesson of lessons) {
    const name = names.get(lesson.studentId);
    const homework = lesson.homework;
    if (!name || !homework?.sentAt) continue;

    const at = lastTouch(lesson);
    if (!at) continue;

    const done = homeworkDone(homework);
    const score = gameScore(homework);
    const played = (homework.results ?? []).length;
    const games = homework.exercises?.length ?? 0;

    const parts = [
      score.total > 0 ? `${score.right}/${score.total} right` : null,
      !done && games > 0 ? `${played} of ${games} games` : null,
    ].filter(Boolean);

    events.push({
      at,
      studentName: name,
      what: done ? `${name} finished the homework` : `${name} is doing the homework`,
      detail: [lesson.title, ...parts].join(" · "),
      href: `/lesson/${lesson.id}/review#homework`,
      done,
    });
  }

  return events.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}

/** "2 minutes ago", from the server's clock, for a page rendered per request. */
export function timeAgo(iso: string, now = Date.now()): string {
  const seconds = Math.round((new Date(iso).getTime() - now) / 1000);
  const rtf = new Intl.RelativeTimeFormat("en-GB", { numeric: "auto" });
  const steps: [number, Intl.RelativeTimeFormatUnit][] = [
    [60, "second"],
    [3600, "minute"],
    [86400, "hour"],
    [604800, "day"],
  ];
  for (const [limit, unit] of steps) {
    if (Math.abs(seconds) < limit) {
      const divisor = limit === 60 ? 1 : limit === 3600 ? 60 : limit === 86400 ? 3600 : 86400;
      return rtf.format(Math.round(seconds / divisor), unit);
    }
  }
  return rtf.format(Math.round(seconds / 604800), "week");
}
