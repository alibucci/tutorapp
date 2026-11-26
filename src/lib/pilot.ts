import { homeworkDone, resultScore } from "./homework";
import type { UsageEntry } from "./usageCost";
import { completedAt, learnerTimezone, setAside, weekBounds, type WeekBounds } from "./week";
import type { Lesson, Student } from "./types";

/**
 * The pilot's numbers, week by week: what was sent and finished, how long it
 * took, whether mistakes came back, whether earlier material held, how much
 * the child engaged, what it asked of the tutor, and what it cost. Read only
 * from what the app recorded - nothing estimated, nothing made up. What the
 * data cannot know (did the parent notice? did the child enjoy it?) is the
 * tutor's notes.
 */

const DAY = 86_400_000;
const localDate = (t: number, timeZone: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone }).format(new Date(t));

export type PilotWeek = {
  label: string;
  key: string;
  sent: number;
  finished: number;
  /** Median hours from sent to finished, for what was finished. */
  hoursToFinish: number | null;
  /** First-attempt marked rounds, all practice. */
  firstGo: { right: number; total: number };
  /** Smart Review games: earlier material, first attempt - retention. */
  retention: { right: number; total: number };
  mistakes: number;
  /** Of those, on a skill that had mistakes before this week. */
  repeated: number;
  activeDays: number;
  replays: number;
  approvals: number;
  rebuilds: number;
  briefs: number;
  /** All AI use for this child; and the part practice between lessons added. */
  costUsd: number;
  practiceCostUsd: number;
};

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const inWeek = (iso: string | undefined | null, w: WeekBounds) => Boolean(iso) && Date.parse(iso!) >= w.start && Date.parse(iso!) < w.end;
const PRACTICE = new Set(["smart_review", "regeneration", "weekly_brief"]);

/** One week of the pilot. */
export function pilotWeek(student: Student, lessons: Lesson[], usage: UsageEntry[], w: WeekBounds): PilotWeek {
  const practice = lessons.filter((l) => l.homework?.sentAt && !setAside(l));
  const sent = practice.filter((l) => inWeek(l.homework!.sentAt, w));
  const finished = sent.filter((l) => homeworkDone(l.homework));
  const hours = finished
    .map((l) => {
      const at = completedAt(l.homework);
      return at ? (Date.parse(at) - Date.parse(l.homework!.sentAt!)) / 3_600_000 : null;
    })
    .filter((h): h is number => h !== null && h >= 0);

  const firstGo = { right: 0, total: 0 };
  const retention = { right: 0, total: 0 };
  const days = new Set<string>();
  let replays = 0;
  for (const l of practice) {
    for (const r of l.homework?.results ?? []) {
      if (!inWeek(r.finishedAt, w)) continue;
      days.add(new Intl.DateTimeFormat("en-CA", { timeZone: w.timezone }).format(new Date(r.finishedAt)));
      if ((r.attempts ?? 1) > 1) {
        replays++;
        continue; // a replay's score says nothing new
      }
      const s = resultScore(r, "first");
      firstGo.right += s.right;
      firstGo.total += s.total;
      if (l.review) {
        retention.right += s.right;
        retention.total += s.total;
      }
    }
  }

  let mistakes = 0;
  let repeated = 0;
  for (const skill of student.skills) {
    const all = skill.mistakes ?? [];
    const now = all.filter((m) => inWeek(m.at, w));
    mistakes += now.length;
    if (now.length && all.some((m) => Date.parse(m.at) < w.start)) repeated += now.length;
  }

  const mine = usage.filter((u) => u.studentId === student.id && inWeek(u.at, w));
  const costUsd = mine.reduce((n, u) => n + u.costUsd, 0);
  return {
    // In the learner's own time zone: their Monday, not UTC's Sunday evening.
    label: `${localDate(w.start, w.timezone)} - ${localDate(w.end - DAY, w.timezone)}`,
    key: new Intl.DateTimeFormat("en-CA", { timeZone: w.timezone }).format(new Date(w.start)),
    sent: sent.length,
    finished: finished.length,
    hoursToFinish: median(hours),
    firstGo,
    retention,
    mistakes,
    repeated,
    activeDays: days.size,
    replays,
    approvals: lessons.filter((l) => l.review?.by === "schedule" && inWeek(l.homework?.sentAt, w)).length,
    rebuilds: mine.filter((u) => u.purpose === "regeneration" && u.ok).length,
    briefs: mine.filter((u) => u.purpose === "weekly_brief" && u.ok).length,
    costUsd,
    practiceCostUsd: mine.filter((u) => PRACTICE.has(u.purpose)).reduce((n, u) => n + u.costUsd, 0),
  };
}

/** The pilot's weeks from its start, and the whole of it added up. */
export function pilotReport(student: Student, lessons: Lesson[], usage: UsageEntry[], startedAt: string, weeks: number, now = Date.now()) {
  const tz = learnerTimezone(student);
  const out: PilotWeek[] = [];
  let at = weekBounds(Date.parse(startedAt), tz);
  for (let i = 0; i < weeks && at.start <= now; i++) {
    out.push(pilotWeek(student, lessons, usage, at));
    at = weekBounds(at.end + 3_600_000, tz);
  }
  const sum = (f: (w: PilotWeek) => number) => out.reduce((n, w) => n + f(w), 0);
  const hours = out.map((w) => w.hoursToFinish).filter((h): h is number => h !== null);
  return {
    weeks: out,
    total: {
      sent: sum((w) => w.sent),
      finished: sum((w) => w.finished),
      hoursToFinish: median(hours),
      firstGo: { right: sum((w) => w.firstGo.right), total: sum((w) => w.firstGo.total) },
      retention: { right: sum((w) => w.retention.right), total: sum((w) => w.retention.total) },
      mistakes: sum((w) => w.mistakes),
      repeated: sum((w) => w.repeated),
      activeDays: sum((w) => w.activeDays),
      replays: sum((w) => w.replays),
      approvals: sum((w) => w.approvals),
      rebuilds: sum((w) => w.rebuilds),
      briefs: sum((w) => w.briefs),
      costUsd: sum((w) => w.costUsd),
      practiceCostUsd: sum((w) => w.practiceCostUsd),
    },
  };
}

/** The months a pilot's usage log lives in. */
export function pilotMonths(startedAt: string, weeks: number): string[] {
  const out = new Set<string>();
  for (let t = Date.parse(startedAt) - 7 * DAY; t <= Date.parse(startedAt) + (weeks + 1) * 7 * DAY; t += DAY) {
    out.add(new Date(t).toISOString().slice(0, 7));
  }
  return [...out];
}
