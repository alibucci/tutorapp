import type { LearningPolicy, LearningSchedule, ScheduleEvent } from "./types";

/**
 * The learning schedule: when a learner's Smart Reviews come, and what the
 * queue does at each slot. Pure functions only - the runner that acts on them
 * is scheduler.ts - so every rule can be tested with a fixed clock.
 *
 * The rules, in short:
 * - only the latest slot that has come round counts: slots missed while the
 *   server was down, or long ago, never pile up into a backlog;
 * - a slot is dealt with once (made, deferred or skipped), whatever happens;
 * - a review the child has not finished, or a draft the tutor has not
 *   approved, holds the next one back - nothing required piles up;
 * - never more than `maxPerWeek` in any seven days;
 * - the content is written at the slot, from the newest results.
 */

const DAY = 86_400_000;
/** A slot found later than this (the server was off) is let go, not made late. */
export const LATE_LIMIT_MS = 12 * 3_600_000;
const LOG_KEPT = 20;

export const DEFAULT_TIMEZONE = "Asia/Shanghai";

/** The agency's template when the admin set one; otherwise Wednesdays at five, approved by the tutor. */
export const BUILT_IN_TEMPLATE: LearningPolicy["template"] = {
  reviewDays: [3],
  time: "17:00",
  timezone: DEFAULT_TIMEZONE,
  minutes: 10,
  maxPerWeek: 2,
  mode: "approval",
};

export function defaultSchedule(now: string, policy?: LearningPolicy | null): LearningSchedule {
  return { enabled: false, ...(policy?.template ?? BUILT_IN_TEMPLATE), updatedAt: now };
}

/**
 * How a schedule really delivers under the agency's policy and the learner's
 * own programme: either can insist the tutor approves first.
 */
export function effectiveMode(s: LearningSchedule, policy: LearningPolicy | null | undefined, learnerApproval: boolean | undefined): LearningSchedule["mode"] {
  if (s.mode === "auto" && (policy?.requireApproval || learnerApproval)) return "approval";
  return s.mode;
}

// ---------------------------------------------------------------------------
// Time zones, without a library
// ---------------------------------------------------------------------------

type Local = { y: number; m: number; d: number; weekday: number; h: number; mi: number };

const WEEKDAY: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** The wall clock in a time zone at an instant. */
export function localParts(at: number, timezone: string): Local {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "numeric",
      day: "numeric",
      weekday: "short",
      hour: "numeric",
      minute: "numeric",
      hourCycle: "h23",
    })
      .formatToParts(new Date(at))
      .map((p) => [p.type, p.value]),
  );
  return {
    y: Number(parts.year),
    m: Number(parts.month),
    d: Number(parts.day),
    weekday: WEEKDAY[parts.weekday],
    h: Number(parts.hour),
    mi: Number(parts.minute),
  };
}

/** The instant a wall-clock time happens in a time zone. */
export function instantOf(y: number, m: number, d: number, h: number, mi: number, timezone: string): number {
  const wanted = Date.UTC(y, m - 1, d, h, mi);
  let at = wanted;
  // Twice is enough to settle on the zone's offset, daylight saving included.
  for (let i = 0; i < 2; i++) {
    const p = localParts(at, timezone);
    at += wanted - Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi);
  }
  return at;
}

export function validTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function hhmm(time: string): [number, number] {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time);
  const h = m ? Math.min(23, Number(m[1])) : 17;
  return [h, m ? Math.min(59, Number(m[2])) : 0];
}

export type Slot = { key: string; at: number };

/** The slot on the local day `offset` days from now, if the schedule has one that day. */
function slotOn(s: LearningSchedule, now: number, offset: number): Slot | null {
  const day = localParts(now + offset * DAY, s.timezone);
  if (!s.reviewDays.includes(day.weekday)) return null;
  const [h, mi] = hhmm(s.time);
  const key = `${day.y}-${String(day.m).padStart(2, "0")}-${String(day.d).padStart(2, "0")}`;
  return { key, at: instantOf(day.y, day.m, day.d, h, mi, s.timezone) };
}

/** The latest slot that has come round. */
export function latestSlot(s: LearningSchedule, now: number): Slot | null {
  for (let k = 0; k <= 8; k++) {
    const slot = slotOn(s, now, -k);
    if (slot && slot.at <= now) return slot;
  }
  return null;
}

/** The next slot still to come - what the tutor and the child are shown. */
export function nextSlot(s: LearningSchedule, now: number): Slot | null {
  if (!s.enabled || s.pausedAt || !s.reviewDays.length) return null;
  for (let k = 0; k <= 8; k++) {
    const slot = slotOn(s, now, k);
    if (slot && slot.at > now && slot.key !== s.lastSlot) return slot;
  }
  return null;
}

// ---------------------------------------------------------------------------
// The queue
// ---------------------------------------------------------------------------

/** A Smart Review as the queue sees it. */
export type QueuedReview = {
  id: string;
  by: "tutor" | "schedule";
  createdAt: string;
  sent: boolean;
  done: boolean;
  /** Set aside by the tutor: skipped or archived. */
  setAside: boolean;
};

export type Decision =
  | { kind: "wait" }
  | { kind: "make"; slot: Slot }
  | { kind: "skip" | "defer"; slot: Slot; reason: string };

/** What to do now. Nothing here acts: scheduler.ts does, under the learner's lock. */
export function decide(s: LearningSchedule, reviews: QueuedReview[], now: number): Decision {
  if (!s.enabled || s.pausedAt || s.mode === "manual" || !s.reviewDays.length) return { kind: "wait" };
  const slot = latestSlot(s, now);
  if (!slot || (s.lastSlot && slot.key <= s.lastSlot)) return { kind: "wait" };
  if (now - slot.at > LATE_LIMIT_MS) {
    return { kind: "skip", slot, reason: "Missed while the app was offline - not made late." };
  }
  const live = reviews.filter((r) => !r.setAside);
  const draft = live.find((r) => !r.sent);
  if (draft) return { kind: "defer", slot, reason: "A Smart Review is still waiting for you to check and send it." };
  const open = live.find((r) => r.sent && !r.done);
  if (open) return { kind: "defer", slot, reason: "The last Smart Review is not finished yet - nothing piles up on top of it." };
  const week = live.filter((r) => r.by === "schedule" && now - Date.parse(r.createdAt) < 7 * DAY).length;
  if (week >= s.maxPerWeek) {
    return { kind: "skip", slot, reason: `Already ${week} this week - the most the schedule allows.` };
  }
  return { kind: "make", slot };
}

/** The schedule with an event added and the slot marked as dealt with. */
export function logged(s: LearningSchedule, e: ScheduleEvent): LearningSchedule {
  return { ...s, lastSlot: e.slot, log: [...(s.log ?? []), e].slice(-LOG_KEPT) };
}

/** The schedule as the tutor sees it now, and its next slot in the learner's own time. */
export function scheduleView(s: LearningSchedule | undefined, now = Date.now(), policy?: LearningPolicy | null): { schedule: LearningSchedule; next: string | null } {
  const schedule = s ?? defaultSchedule(new Date(now).toISOString(), policy);
  const slot = nextSlot(schedule, now);
  const next = slot
    ? new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: schedule.timezone }).format(slot.at)
    : null;
  return { schedule, next };
}
