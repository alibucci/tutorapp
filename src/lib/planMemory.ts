import type * as Memory from "./memory";
import type { MemoryState, Skill, SkillMistake } from "./types";

/**
 * What a child's practice says, for the lesson planner: the weak points to
 * review briefly, what is due back, the mistakes that keep coming back, and
 * what is solid and need not be taught again.
 *
 * Anonymous like everything the planner sends: topics and short answers, never
 * a name, and any line that mentions one is dropped. Results are given as
 * counts in words ("2 of 4 right first time"), never as a percentage - a few
 * games are a sign, not proof.
 *
 * No runtime imports: memory.ts's rules are handed in, so this file runs under
 * plain node in the tests with the real rules.
 */

/** The parts of memory.ts this needs. Pass the module itself. */
export type MemoryRules = Pick<typeof Memory, "memoryState" | "recurringMistakes" | "skillKey">;

export type MemoryPoint = {
  /** skillKey: the same skill in two children's records is one point. */
  key: string;
  topic: string;
  state: MemoryState;
  /** Its spaced review has come round. */
  due: boolean;
  /** Newest homework and Smart Review results, in words. */
  results: string[];
  /** Mistakes that keep coming back, with the right form. */
  mistakes: string[];
};

/**
 * One child's memory, as the planner sees it. Empty lists when there is nothing.
 * - weak: still learning, or was solid and slipped;
 * - along: coming along, and either due for review or practised lately - its
 *   results say how hard to pitch it;
 * - solid: retained, not to be taught again.
 */
export type ChildMemory = { weak: MemoryPoint[]; along: MemoryPoint[]; solid: MemoryPoint[] };

const WEAK_MAX = 4;
const ALONG_MAX = 3;
const SOLID_MAX = 6;
const MISTAKES_PER_POINT = 2;
const RESULTS_PER_POINT = 2;
/** Results older than this say little about the next lesson. */
const RECENT_DAYS = 30;
const DAY = 86_400_000;

const SHORT = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

/** Names to keep out, as lower-case words: "Anna Lee" keeps out "anna" and "lee". */
function nameWords(names: string[]): string[] {
  return names.flatMap((n) => n.toLowerCase().split(/[^\p{L}]+/u)).filter((w) => w.length >= 2);
}

function mentions(text: string, words: string[]): boolean {
  const own = new Set(text.toLowerCase().split(/[^\p{L}]+/u));
  return words.some((w) => own.has(w));
}

function clip(text: string, max: number): string {
  const t = text.trim().replace(/\s+/g, " ");
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

/** The newest practice results, in words, with where and when they came from. */
function resultsOf(skill: Skill, now: string): string[] {
  const since = new Date(Date.parse(now) - RECENT_DAYS * DAY).toISOString();
  return (skill.evidence ?? [])
    .filter((e) => e.source !== "lesson" && (e.total ?? 0) > 0 && e.at >= since)
    .slice(-RESULTS_PER_POINT)
    .map((e) => `${e.right ?? 0} of ${e.total} right first time (${e.source === "review" ? "Smart Review" : "homework"}, ${SHORT.format(new Date(e.at))})`);
}

/**
 * The mistakes worth a warm-up: the same wrong answer most often first, each
 * with its right form. Only ones with a right form - "got it wrong" alone
 * gives the planner nothing to review.
 */
function mistakesOf(mistakes: SkillMistake[], hide: string[]): string[] {
  const count = new Map<string, number>();
  for (const m of [...mistakes].reverse()) {
    const answered = clip(m.answered ?? "", 30);
    const correct = clip(m.correct ?? "", 30);
    if (!answered || !correct || answered.toLowerCase() === correct.toLowerCase()) continue;
    if (mentions(`${answered} ${correct}`, hide)) continue;
    const line = `"${answered}" instead of "${correct}"`;
    count.set(line, (count.get(line) ?? 0) + 1);
  }
  // Map keeps the newest first among equals; sort is stable.
  return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([line]) => line).slice(0, MISTAKES_PER_POINT);
}

const newest = (s: Skill) => (s.lastPracticed && s.lastPracticed > s.lastSeen ? s.lastPracticed : s.lastSeen);

/**
 * One child's skills, read for the planner. Programme skills (the story
 * track) are left out: that teaching has its own checked track, and an
 * ordinary lesson never reviews it.
 */
export function childMemory(skills: Skill[], opts: { now: string; hide?: string[] }, rules: MemoryRules): ChildMemory {
  const hide = nameWords(opts.hide ?? []);
  const points = skills
    .filter((s) => s.area !== "curriculum" && s.topic.trim() && !mentions(s.topic, hide))
    .map((s) => ({
      skill: s,
      point: {
        key: rules.skillKey(s.topic) || s.topic.toLowerCase(),
        topic: clip(s.topic, 60),
        state: rules.memoryState(s, opts.now),
        due: Boolean(s.reviewAt && s.reviewAt <= opts.now),
        results: resultsOf(s, opts.now),
        mistakes: mistakesOf(rules.recurringMistakes(s), hide),
      } satisfies MemoryPoint,
    }));
  const said = (p: MemoryPoint) => p.results.length + p.mistakes.length > 0;

  const weak = points
    .filter((p) => p.point.state === "learning" || p.point.state === "needs_review")
    .sort(
      (a, b) =>
        b.point.mistakes.length - a.point.mistakes.length ||
        Number(b.point.due) - Number(a.point.due) ||
        newest(b.skill).localeCompare(newest(a.skill)),
    );
  // Coming along with nothing due and nothing lately says nothing to plan by.
  const along = points
    .filter((p) => p.point.state === "improving" && (p.point.due || said(p.point)))
    .sort((a, b) => Number(b.point.due) - Number(a.point.due) || (a.skill.reviewAt ?? "").localeCompare(b.skill.reviewAt ?? ""));
  const solid = points
    .filter((p) => p.point.state === "retained")
    .sort((a, b) => newest(b.skill).localeCompare(newest(a.skill)));

  const only = (list: typeof points, max: number) => list.slice(0, max).map((p) => p.point);
  return { weak: only(weak, WEAK_MAX), along: only(along, ALONG_MAX), solid: only(solid, SOLID_MAX) };
}

const isEmpty = (m?: ChildMemory) => !m || (!m.weak.length && !m.along.length && !m.solid.length);

/** One line about one point: its results and mistakes, joined. */
function pointLine(topic: string, tag: string, results: string[], mistakes: string[]): string {
  const parts = [
    results.length ? results.join("; ") : "",
    mistakes.length ? `keeps answering ${mistakes.join(", ")}` : "",
  ].filter(Boolean);
  return `- ${topic}${tag ? ` (${tag})` : ""}${parts.length ? `: ${parts.join("; ")}` : ""}`;
}

const STATE_TAG: Partial<Record<MemoryState, string>> = {
  learning: "still learning",
  needs_review: "was solid, needs going over again",
};

const ALONG_HEAD = "Coming along - review only what is due; the results say how hard to pitch:";
/** Said either way, so "not due" reads as a choice, not a gap. */
const dueTag = (due: boolean) => (due ? "due for review" : "not due yet");

function describeOne(m: ChildMemory): string {
  const lines = ["What this child's practice shows (lessons, homework, Smart Reviews). A few games are a sign, not proof."];
  if (m.weak.length) {
    lines.push("Weak points - review briefly:", ...m.weak.map((p) => pointLine(p.topic, STATE_TAG[p.state] ?? "", p.results, p.mistakes)));
  }
  if (m.along.length) {
    lines.push(ALONG_HEAD, ...m.along.map((p) => pointLine(p.topic, dueTag(p.due), p.results, p.mistakes)));
  }
  if (m.solid.length) lines.push(`Solid - do not teach again: ${m.solid.map((p) => p.topic).join("; ")}`);
  return lines.join("\n");
}

type Shared = { topic: string; children: number; due: boolean; results: string[]; mistakes: string[] };

/** The same point across children: how many have it, their newest results, every mistake once. */
function gather(lists: MemoryPoint[][], skip: Set<string>): Shared[] {
  const byKey = new Map<string, Shared>();
  for (const list of lists) {
    for (const p of list) {
      if (skip.has(p.key)) continue;
      const s = byKey.get(p.key) ?? { topic: p.topic, children: 0, due: false, results: [], mistakes: [] };
      s.children++;
      s.due ||= p.due;
      // One result per child is enough to see the spread in a group.
      if (p.results.length) s.results.push(p.results.at(-1)!);
      for (const x of p.mistakes) if (!s.mistakes.includes(x)) s.mistakes.push(x);
      byKey.set(p.key, s);
    }
  }
  // Shared first: a point most of the group needs is worth the time.
  return [...byKey.values()].sort((a, b) => b.children - a.children);
}

function describeGroup(all: (ChildMemory | undefined)[]): string {
  const n = all.length;
  const known = all.filter((m): m is ChildMemory => !isEmpty(m));
  const whoTag = (k: number) =>
    k === 1 ? "one child only - keep it light, do not single them out" : k === n ? "every child" : `shared by ${k} children`;

  const weakKeys = new Set(known.flatMap((m) => m.weak.map((p) => p.key)));
  const weak = gather(known.map((m) => m.weak), new Set()).slice(0, WEAK_MAX);
  const along = gather(known.map((m) => m.along), weakKeys).slice(0, ALONG_MAX);
  const alongKeys = new Set(known.flatMap((m) => m.along.map((p) => p.key)));
  // Solid for the whole group only: a lesson cannot skip a point for one child.
  const solid = gather(known.map((m) => m.solid), new Set([...weakKeys, ...alongKeys]))
    .filter((s) => s.children === n)
    .slice(0, SOLID_MAX);

  const lines = [`What the children's practice shows (${n} children; lessons, homework, Smart Reviews). A few games are a sign, not proof.`];
  if (known.length < n) lines.push(`No practice record yet for ${n - known.length === 1 ? "one child" : `${n - known.length} children`}.`);
  if (weak.length) lines.push("Weak points - review briefly, shared ones first:", ...weak.map((s) => pointLine(s.topic, whoTag(s.children), s.results, s.mistakes)));
  if (along.length) {
    lines.push(
      ALONG_HEAD,
      ...along.map((s) => pointLine(s.topic, [whoTag(s.children), dueTag(s.due)].join(", "), s.results, s.mistakes)),
    );
  }
  if (solid.length) lines.push(`Solid for every child - do not teach again: ${solid.map((s) => s.topic).join("; ")}`);
  return lines.length > 1 + Number(known.length < n) ? lines.join("\n") : "";
}

/**
 * The memory block for the planner's prompt, one child or a group. Empty when
 * no child has anything on record: the prompt is then asked as before.
 */
export function describeMemory(all: (ChildMemory | undefined)[]): string {
  if (all.every(isEmpty)) return "";
  return all.length === 1 ? describeOne(all[0]!) : describeGroup(all);
}

// ---------------------------------------------------------------------------
// The review points a built lesson says it worked in
// ---------------------------------------------------------------------------

const REVIEW_MAX = 3;
const same = (a: string) => a.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/**
 * The review list as stored: short, no repeats, and nothing the tutor took
 * out before - the model is told, and this holds it to that.
 */
export function cleanReview(lines: string[], rejected: string[] = []): string[] {
  const no = new Set(rejected.map(same));
  const out: string[] = [];
  for (const raw of lines) {
    const line = clip(raw, 140);
    if (!line || no.has(same(line)) || out.some((o) => same(o) === same(line))) continue;
    out.push(line);
  }
  return out.slice(0, REVIEW_MAX);
}
