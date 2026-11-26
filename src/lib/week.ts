import { homeworkDone, resultScore } from "./homework";
import { memoryState } from "./memory";
import { DEFAULT_TIMEZONE, type QueuedReview, decide, instantOf, localParts, nextSlot, validTimezone } from "./schedule";
import type { Homework, LearningSchedule, Lesson, Skill, Student } from "./types";

/**
 * The learner's week, for the child's and the parent's screens: what was
 * finished since Monday, what to do now, and when the next practice comes.
 *
 * Pure, with a clock passed in, so every rule can be tested. It reads only
 * what was really recorded: a game nobody played is no data (never a wrong
 * answer), and nothing here guesses how long anything took.
 *
 * The imports are the import-free modules (homework, memory, schedule), so a
 * test can load this file straight from source.
 */

const DAY = 86_400_000;

/**
 * What a homework is, for the family: homework after a lesson, practice
 * between lessons (a Smart Review), a Bible story, or extra homework the
 * tutor set. Lesson homework and Smart Review are never mixed together.
 */
export type ActivityKind = "lesson" | "review" | "story" | "extra";

export const ACTIVITY_LABEL: Record<ActivityKind, string> = {
  lesson: "After the lesson",
  review: "Practice between lessons",
  story: "Bible story",
  extra: "Extra homework",
};

export function activityKind(lesson: Pick<Lesson, "review" | "module" | "kind">): ActivityKind {
  if (lesson.review) return "review";
  if (lesson.module) return "story";
  return lesson.kind === "practice" ? "extra" : "lesson";
}

/** The learner's own time zone: the schedule's, or the app's default. */
export function learnerTimezone(student: Pick<Student, "schedule">): string {
  const tz = student.schedule?.timezone;
  return tz && validTimezone(tz) ? tz : DEFAULT_TIMEZONE;
}

// ---------------------------------------------------------------------------
// The week
// ---------------------------------------------------------------------------

/** Monday 00:00 to the next Monday 00:00, in the learner's time zone. */
export type WeekBounds = { start: number; end: number; timezone: string };

export function weekBounds(now: number, timezone: string): WeekBounds {
  const p = localParts(now, timezone);
  const sinceMonday = (p.weekday + 6) % 7;
  // Date.UTC rolls a day of 0 or -3 over into the month before, so this is
  // only calendar arithmetic, never an offset guess.
  const monday = new Date(Date.UTC(p.y, p.m - 1, p.d - sinceMonday));
  const nextMonday = new Date(monday.getTime() + 7 * DAY);
  const at = (d: Date) => instantOf(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), 0, 0, timezone);
  return { start: at(monday), end: at(nextMonday), timezone };
}

const within = (iso: string | undefined | null, w: WeekBounds) => {
  if (!iso) return false;
  const t = Date.parse(iso);
  return t >= w.start && t < w.end;
};

/** A game played more than once: its finish time is the replay's, not the first go. */
const replayed = (r: { attempts?: number }) => (r.attempts ?? 1) > 1;

/**
 * When the child finished everything a homework asked, or null if they have
 * not. A replay rewrites a game's finish time, so replayed games are dated by
 * the others; if every game was replayed, the earliest finish stands, being
 * the closest thing kept to when it was first done.
 */
export function completedAt(homework: Homework | undefined): string | null {
  if (!homework || !homeworkDone(homework)) return null;
  const results = homework.results ?? [];
  const firstGoes = results.filter((r) => !replayed(r)).map((r) => r.finishedAt);
  const games = firstGoes.length ? firstGoes : results.map((r) => r.finishedAt).sort().slice(0, 1);
  const times = [...games, homework.answers?.submittedAt].filter((t): t is string => Boolean(t));
  return times.sort().at(-1) ?? null;
}

/** Finished this week, newest first. */
export function doneThisWeek(lessons: Lesson[], week: WeekBounds): Lesson[] {
  return lessons
    .map((l) => ({ l, at: completedAt(l.homework) }))
    .filter((x) => within(x.at, week))
    .sort((a, b) => b.at!.localeCompare(a.at!))
    .map((x) => x.l);
}

/**
 * Rounds answered right this week, out of rounds that were marked - games
 * played for the first time this week, first go only, as in every other
 * score. A replay says nothing new, and a skipped or unheard round is neither
 * right nor wrong. `total` of 0 means there is nothing to say.
 */
export function answeredThisWeek(lessons: Lesson[], week: WeekBounds): { right: number; total: number } {
  let right = 0;
  let total = 0;
  for (const lesson of lessons) {
    for (const r of lesson.homework?.results ?? []) {
      if (replayed(r) || !within(r.finishedAt, week)) continue;
      const first = resultScore(r, "first");
      right += first.right;
      total += first.total;
    }
  }
  return { right, total };
}

// ---------------------------------------------------------------------------
// What to do now
// ---------------------------------------------------------------------------

/** A Smart Review the tutor skipped or archived: still there, but not pushed. */
export function setAside(lesson: Pick<Lesson, "review">): boolean {
  return Boolean(lesson.review?.state && lesson.review.state !== "deferred");
}

const started = (l: Lesson) => Boolean(l.homework?.results?.length || l.homework?.answers);

/**
 * Everything sent and not finished, the one to do now first: something
 * already started (finish it), then the newest sent. Set-aside reviews go
 * last and are never the one to do now.
 */
export function openQuests(lessons: Lesson[]): Lesson[] {
  return lessons
    .filter((l) => l.homework?.sentAt && !homeworkDone(l.homework))
    .sort(
      (a, b) =>
        Number(setAside(a)) - Number(setAside(b)) ||
        Number(started(b)) - Number(started(a)) ||
        b.homework!.sentAt!.localeCompare(a.homework!.sentAt!),
    );
}

export function currentQuest(lessons: Lesson[]): Lesson | null {
  const first = openQuests(lessons)[0];
  return first && !setAside(first) ? first : null;
}

/** How long it is meant to take - known only for a Smart Review. */
export function plannedMinutes(lesson: Pick<Lesson, "review">): number | null {
  return lesson.review?.minutes ?? null;
}

/** A Smart Review as the queue sees it (the same reading as scheduler.ts). */
function queued(lesson: Lesson): QueuedReview {
  return {
    id: lesson.id,
    by: lesson.review?.by ?? "tutor",
    createdAt: lesson.createdAt,
    sent: Boolean(lesson.homework?.sentAt),
    done: homeworkDone(lesson.homework),
    setAside: setAside(lesson),
  };
}

/** The next practice the schedule will really bring, and whether its time is firm. */
export type NextPractice = { at: number; withTime: boolean };

/**
 * When the next Smart Review comes. Only a slot the queue would act on: none
 * while one is still open or waiting for the tutor (the next is held back),
 * and a slot the weekly limit would skip is passed over. When the tutor checks
 * each one first, only the day is firm.
 */
export function nextPractice(schedule: LearningSchedule | undefined, lessons: Lesson[], now: number): NextPractice | null {
  if (!schedule || schedule.mode === "manual") return null;
  const reviews = lessons.filter((l) => l.review).map(queued);
  let from = now;
  for (let i = 0; i < 4; i++) {
    const slot = nextSlot(schedule, from);
    if (!slot) return null;
    const d = decide(schedule, reviews, slot.at);
    if (d.kind === "make") return { at: slot.at, withTime: schedule.mode === "auto" };
    if (d.kind !== "skip") return null;
    from = slot.at;
  }
  return null;
}

const dayKey = (at: number, tz: string) => {
  const p = localParts(at, tz);
  return `${p.y}-${p.m}-${p.d}`;
};

/** "today at 17:00", "tomorrow", "on Fri at 17:00" - for the child. */
export function whenShort(next: NextPractice, now: number, tz: string): string {
  const time = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: tz }).format(next.at);
  const weekday = new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: tz }).format(next.at);
  const day =
    dayKey(next.at, tz) === dayKey(now, tz) ? "today" : dayKey(next.at, tz) === dayKey(now + DAY, tz) ? "tomorrow" : `on ${weekday}`;
  return next.withTime ? `${day} at ${time}` : day;
}

/** "Fri 27 Nov, 17:00" - for the parent, who plans around it. */
export function whenLong(next: NextPractice, tz: string): string {
  const opts: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short", timeZone: tz };
  if (next.withTime) Object.assign(opts, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  return new Intl.DateTimeFormat("en-GB", opts).format(next.at);
}

const WEEKDAY_NAME = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "Wed and Fri, about 10 minutes each" - the plan, or null when there is none. */
export function plannedPractice(schedule: LearningSchedule | undefined): string | null {
  if (!schedule?.enabled || schedule.pausedAt || schedule.mode === "manual" || !schedule.reviewDays.length) return null;
  const days = [...new Set(schedule.reviewDays)].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map((d) => WEEKDAY_NAME[d]);
  const list = days.length > 1 ? `${days.slice(0, -1).join(", ")} and ${days.at(-1)}` : days[0];
  return `${list}, about ${schedule.minutes} minutes each`;
}

// ---------------------------------------------------------------------------
// What is being learnt, in the tutor's words rather than the games'
// ---------------------------------------------------------------------------

/**
 * Skills as a parent should read them. The tutor's status from lessons leads
 * (memory.ts): games only bring a skill back for practice, they never decide
 * it is learnt. Not assessed yet is left out - there is nothing to say.
 */
export function learningFocus(skills: Skill[], now: number): { practice: Skill[]; coming: Skill[]; solid: Skill[] } {
  const iso = new Date(now).toISOString();
  const state = (s: Skill) => memoryState(s, iso);
  return {
    practice: skills.filter((s) => state(s) === "learning" || state(s) === "needs_review"),
    coming: skills.filter((s) => state(s) === "improving"),
    solid: skills.filter((s) => state(s) === "retained"),
  };
}

// ---------------------------------------------------------------------------
// Put together, for each screen
// ---------------------------------------------------------------------------

export type StudentWeek = {
  doneCount: number;
  current: Lesson | null;
  /** Open, but not the one to do now - folded away on the screen. */
  others: Lesson[];
  /** "on Fri at 17:00", or null when nothing is planned. */
  next: string | null;
};

/** The child's week. `lessons` are the child's own, any order. */
export function studentWeek(student: Pick<Student, "schedule">, lessons: Lesson[], now = Date.now()): StudentWeek {
  const tz = learnerTimezone(student);
  const open = openQuests(lessons);
  const current = currentQuest(lessons);
  const next = nextPractice(student.schedule, lessons, now);
  return {
    doneCount: doneThisWeek(lessons, weekBounds(now, tz)).length,
    current,
    others: open.filter((l) => l !== current),
    next: next && whenShort(next, now, tz),
  };
}

function countBy(lessons: Lesson[]): Record<ActivityKind, number> {
  const n: Record<ActivityKind, number> = { lesson: 0, review: 0, story: 0, extra: 0 };
  for (const l of lessons) n[activityKind(l)]++;
  return n;
}

export type ParentWeek = {
  /** "23 Nov - 29 Nov" in the learner's time zone. */
  label: string;
  done: Lesson[];
  doneBy: Record<ActivityKind, number>;
  answered: { right: number; total: number };
  current: Lesson | null;
  waiting: number;
  plan: string | null;
  next: string | null;
  focus: ReturnType<typeof learningFocus>;
};

export function parentWeek(student: Pick<Student, "schedule" | "skills">, lessons: Lesson[], now = Date.now()): ParentWeek {
  const tz = learnerTimezone(student);
  const week = weekBounds(now, tz);
  const done = doneThisWeek(lessons, week);
  const current = currentQuest(lessons);
  const next = nextPractice(student.schedule, lessons, now);
  const date = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: tz });
  return {
    label: `${date.format(week.start)} - ${date.format(week.end - 1)}`,
    done,
    doneBy: countBy(done),
    answered: answeredThisWeek(lessons, week),
    current,
    waiting: openQuests(lessons).filter((l) => l !== current && !setAside(l)).length,
    plan: plannedPractice(student.schedule),
    next: next && whenLong(next, tz),
    focus: learningFocus(student.skills, now),
  };
}
