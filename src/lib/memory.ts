import type { MemoryState, Skill, SkillEvidence, SkillMistake, SkillStatus } from "./types";

/**
 * The learner's long-term memory: their skills, with the evidence behind each,
 * the mistakes that keep coming back, and when each is due to be practised
 * again. Pure functions only - the store and the model live elsewhere - so
 * every rule here can be tested on its own.
 *
 * Two kinds of evidence, kept apart on purpose:
 * - a lesson: the status the tutor accepted (skills.ts). Only this moves a
 *   skill between "needs work", "coming along" and "solid";
 * - homework: first-attempt rounds right out of rounds marked. This only
 *   moves when the skill comes back for review. One game is not proof a
 *   skill is missing, nor that it is mastered.
 */

const EVIDENCE_KEPT = 30;
const MISTAKES_KEPT = 12;
/** Days between reviews, growing as the child keeps getting it right. */
export const REVIEW_DAYS = [2, 4, 7, 14, 30, 60];
/** Fewer marked rounds than this say nothing either way. */
const ENOUGH_ROUNDS = 2;

const DAY = 86_400_000;

// ---------------------------------------------------------------------------
// Names and ids
// ---------------------------------------------------------------------------

/**
 * A skill name reduced to what it means, for spotting the same skill written
 * two ways: "Past tense: went, saw" and "past tense" are one key. Examples
 * after a colon or in brackets are not part of the name.
 */
export function skillKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .split(":")[0]
    .replace(/[^a-z0-9À-ɏЀ-ӿ一-鿿]+/g, " ")
    .replace(/\b(the|a|an|using|use|correct|correctly)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hash(text: string): string {
  let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return h.toString(36).slice(0, 5);
}

/**
 * The id a skill is given the first time it is read. Made from what it was
 * then, so reading an old record twice gives the same id both times.
 */
export function newSkillId(topic: string, firstSeen: string): string {
  const slug = skillKey(topic).replace(/ /g, "-").slice(0, 32) || "skill";
  return `${slug}-${hash(`${topic}|${firstSeen}`)}`;
}

/** Every skill with an id. Safe to call on every read. */
export function withIds(skills: Skill[]): Skill[] {
  return skills.map((s) => (s.id ? s : { ...s, id: newSkillId(s.topic, s.firstSeen) }));
}

/** The skill a name or id refers to: by id, by name, by an old name, then by meaning. */
export function findSkill(skills: Skill[], ref: string): Skill | undefined {
  if (!ref) return undefined;
  const byId = skills.find((s) => s.id === ref);
  if (byId) return byId;
  const exact = skills.find((s) => s.topic === ref || s.aliases?.includes(ref));
  if (exact) return exact;
  const key = skillKey(ref);
  if (!key) return undefined;
  return skills.find((s) => skillKey(s.topic) === key || s.aliases?.some((a) => skillKey(a) === key));
}

// ---------------------------------------------------------------------------
// Where a skill stands
// ---------------------------------------------------------------------------

/** First-attempt share of the homework evidence, newest `last` entries. */
function recentShare(skill: Skill, last = 2): { right: number; total: number } | null {
  const practice = (skill.evidence ?? []).filter((e) => e.source !== "lesson" && (e.total ?? 0) > 0).slice(-last);
  const total = practice.reduce((n, e) => n + (e.total ?? 0), 0);
  if (total < ENOUGH_ROUNDS) return null;
  return { right: practice.reduce((n, e) => n + (e.right ?? 0), 0), total };
}

/**
 * Where the skill stands for practice. The tutor's status leads; homework can
 * only say a solid skill needs going over again, and the calendar says when.
 */
export function memoryState(skill: Skill, now = new Date().toISOString()): MemoryState {
  const evidence = skill.evidence ?? [];
  if (!skill.lessonIds.length && !evidence.length) return "not_assessed";
  if (skill.status === "struggling") return "learning";
  const recent = recentShare(skill);
  const slipping = recent !== null && recent.right / recent.total < 0.5;
  const due = Boolean(skill.reviewAt && skill.reviewAt <= now);
  if (skill.status === "solid") return slipping || due ? "needs_review" : "retained";
  return slipping && due ? "needs_review" : "improving";
}

// ---------------------------------------------------------------------------
// Recording evidence
// ---------------------------------------------------------------------------

const addDays = (iso: string, days: number) => new Date(new Date(iso).getTime() + days * DAY).toISOString();

/** First review after a lesson: soon for a skill still being learnt. */
function firstReview(status: SkillStatus, at: string): { step: number; reviewAt: string } {
  const step = status === "solid" ? 2 : status === "improving" ? 1 : 0;
  return { step, reviewAt: addDays(at, REVIEW_DAYS[step]) };
}

/** A lesson's accepted status, as evidence. Called when the tutor applies the changes. */
export function recordLesson(skill: Skill, lessonId: string, status: SkillStatus, at: string, note?: string): Skill {
  const evidence = [...(skill.evidence ?? []).filter((e) => !(e.source === "lesson" && e.lessonId === lessonId))];
  evidence.push({ at, source: "lesson", lessonId, status, ...(note && { note }) });
  // A lesson resets the review clock only when it changed the picture, or
  // when nothing was scheduled yet.
  const schedule = !skill.reviewAt || skill.status !== status ? firstReview(status, at) : {};
  return { ...skill, evidence: evidence.slice(-EVIDENCE_KEPT), ...schedule };
}

export type Practice = {
  at: string;
  lessonId: string;
  source: "homework" | "review";
  /** First attempt only: a replay from memory says nothing new. */
  right: number;
  total: number;
  mistakes: Omit<SkillMistake, "at" | "lessonId">[];
};

/**
 * A homework or review game that practised this skill. The review clock moves
 * only on enough marked rounds: well done pushes the next review further out,
 * badly done brings it back soon, in between keeps the same gap.
 */
export function recordPractice(skill: Skill, p: Practice): Skill {
  const evidence: SkillEvidence[] = [
    ...(skill.evidence ?? []).filter((e) => !(e.source !== "lesson" && e.lessonId === p.lessonId)),
    { at: p.at, source: p.source, lessonId: p.lessonId, right: p.right, total: p.total },
  ];
  const mistakes = [
    ...(skill.mistakes ?? []).filter((m) => m.lessonId !== p.lessonId),
    ...p.mistakes.map((m) => ({ ...m, at: p.at, lessonId: p.lessonId })),
  ].slice(-MISTAKES_KEPT);

  let step = skill.step ?? 0;
  let reviewAt = skill.reviewAt;
  if (p.total >= ENOUGH_ROUNDS) {
    const share = p.right / p.total;
    if (share >= 0.8) step = Math.min(step + 1, REVIEW_DAYS.length - 1);
    else if (share < 0.5) step = 0;
    reviewAt = addDays(p.at, REVIEW_DAYS[step]);
  }
  return {
    ...skill,
    evidence: evidence.slice(-EVIDENCE_KEPT),
    mistakes,
    lastPracticed: p.at,
    step,
    ...(reviewAt && { reviewAt }),
  };
}

// ---------------------------------------------------------------------------
// Merging duplicates
// ---------------------------------------------------------------------------

const RANK: Record<SkillStatus, number> = { struggling: 0, improving: 1, solid: 2 };

/**
 * Several skills that are really one, folded into `keep`. Nothing is lost:
 * the other names become aliases, every lesson, piece of evidence and mistake
 * is kept, and the status is the most recent one the tutor accepted.
 */
export function mergeSkills(skills: Skill[], keepId: string, mergeIds: string[], rename?: { topic?: string; parent?: string; area?: Skill["area"] }): Skill[] {
  const all = withIds(skills);
  const keep = all.find((s) => s.id === keepId);
  const merged = all.filter((s) => mergeIds.includes(s.id!) && s.id !== keepId);
  if (!keep || !merged.length) return all;
  const group = [keep, ...merged];
  const latest = [...group].sort((a, b) => b.lastSeen.localeCompare(a.lastSeen))[0];
  const byTime = <T extends { at: string }>(xs: T[]) => xs.sort((a, b) => a.at.localeCompare(b.at));
  const topic = rename?.topic?.trim() || keep.topic;
  const aliases = [...new Set(group.flatMap((s) => [s.topic, ...(s.aliases ?? [])]))].filter((a) => a !== topic);
  const reviews = group.map((s) => s.reviewAt).filter((r): r is string => Boolean(r)).sort();
  const next: Skill = {
    ...keep,
    topic,
    status: latest.status,
    note: latest.note,
    practice: latest.practice ?? keep.practice,
    firstSeen: group.map((s) => s.firstSeen).sort()[0],
    lastSeen: latest.lastSeen,
    lessonIds: [...new Set(group.flatMap((s) => s.lessonIds))],
    aliases,
    evidence: byTime(group.flatMap((s) => s.evidence ?? [])).slice(-EVIDENCE_KEPT),
    mistakes: byTime(group.flatMap((s) => s.mistakes ?? [])).slice(-MISTAKES_KEPT),
    ...(rename?.parent !== undefined && { parent: rename.parent || undefined }),
    ...(rename?.area && { area: rename.area }),
    // The soonest review wins: one of them was due.
    ...(reviews[0] && { reviewAt: reviews[0] }),
    step: Math.min(...group.map((s) => s.step ?? 0)),
  };
  const lastPracticed = group.map((s) => s.lastPracticed).filter(Boolean).sort().at(-1);
  if (lastPracticed) next.lastPracticed = lastPracticed;
  return sortSkills(all.filter((s) => !mergeIds.includes(s.id!) || s.id === keepId).map((s) => (s.id === keepId ? next : s)));
}

/** Needs work first, then the most recent - what the child's screen is for. */
export function sortSkills(skills: Skill[]): Skill[] {
  return [...skills].sort((a, b) => RANK[a.status] - RANK[b.status] || b.lastSeen.localeCompare(a.lastSeen));
}

// ---------------------------------------------------------------------------
// What to practise
// ---------------------------------------------------------------------------

/** Skills due for review now, the longest overdue first. */
export function dueSkills(skills: Skill[], now = new Date().toISOString()): Skill[] {
  return skills
    .filter((s) => memoryState(s, now) !== "not_assessed" && s.reviewAt && s.reviewAt <= now)
    .sort((a, b) => (a.reviewAt ?? "").localeCompare(b.reviewAt ?? ""));
}

/** Mistakes that came back in more than one homework: the ones worth a lesson warm-up. */
export function recurringMistakes(skill: Skill): SkillMistake[] {
  const lessons = new Set((skill.mistakes ?? []).map((m) => m.lessonId));
  return lessons.size > 1 ? (skill.mistakes ?? []) : [];
}

// ---------------------------------------------------------------------------
// From a finished game to the skills it practised
// ---------------------------------------------------------------------------

/**
 * The skills a game practised: the ones it was built for, or - for games made
 * before games named their skills - the skill its topic is.
 */
export function skillsOfGame(skills: Skill[], skillIds: string[] | undefined, topic: string): Skill[] {
  const named = (skillIds ?? []).map((id) => skills.find((s) => s.id === id)).filter((s): s is Skill => Boolean(s));
  if (named.length) return named;
  const byTopic = findSkill(skills, topic);
  return byTopic ? [byTopic] : [];
}

/** Every skill a game practised, with that game recorded on it. */
export function recordGame(skills: Skill[], skillIds: string[] | undefined, topic: string, p: Practice): Skill[] {
  const all = withIds(skills);
  const hit = new Set(skillsOfGame(all, skillIds, topic).map((s) => s.id));
  if (!hit.size) return skills;
  return all.map((s) => (hit.has(s.id) ? recordPractice(s, p) : s));
}
