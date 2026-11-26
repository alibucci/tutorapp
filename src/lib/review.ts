import { buildExercises } from "./exercises";
import { type ReviewPick, pickForReview, recurringMistakes, withIds } from "./memory";
import { createLesson, getLesson, listLessons, updateLesson } from "./store";
import { withUsage } from "./usage";
import { DEFAULT_LANGUAGE, type Lesson, type SmartReview, type Student } from "./types";

/**
 * Smart Review: a short practice between lessons, built from the learner's
 * memory - what still needs work, what is due back, and what they know, used
 * somewhere new - and from what the lessons really covered. It is a "practice"
 * lesson like extra homework, so the child's screen, the scores and the
 * memory all work as for any homework; it only never sends itself: the tutor
 * sends it, or the learning schedule does.
 */

export const REVIEW_MINUTES = [5, 10, 15] as const;

const ROLE_LINE: Record<ReviewPick["role"], string> = {
  weak: "still needs work - most of the practice",
  consolidate: "keep it fresh",
  apply: "they know it - use it in a new situation",
};

/** What the lessons covered lately: the only material a review may use. */
function coveredLately(lessons: Lesson[], take = 4): string[] {
  return lessons
    .filter((l) => l.kind !== "practice" && l.kind !== "intro" && l.summary)
    .slice(0, take)
    .flatMap((l) => l.summary!.covered)
    .slice(0, 16);
}

/**
 * The request the homework builder works from - the same path as extra
 * homework, so a review gets the same games and the same checks.
 */
export function reviewRequest(picks: ReviewPick[], covered: string[], minutes: number, comment?: string): string {
  const skills = picks
    .map((p, i) => {
      const again = recurringMistakes(p.skill).length ? recurringMistakes(p.skill) : (p.skill.mistakes ?? []);
      const mistakes = again
        .slice(-3)
        .map((m) => `"${m.answered}"${m.correct ? ` (right: "${m.correct}")` : ""} in "${m.asked}"`)
        .join("; ");
      return `${i + 1}. ${p.skill.topic} - ${ROLE_LINE[p.role]}. ${p.skill.note}${
        mistakes ? `\n   Mistakes they made, to come back to in NEW sentences: ${mistakes}` : ""
      }`;
    })
    .join("\n");
  return [
    `Smart Review: about ${minutes} minutes of practice going back over what this learner has already had.`,
    "Make NEW examples of these skills - never copy old questions word for word:",
    skills,
    covered.length ? `Use only material from what the lessons covered: ${covered.join("; ")}.` : "",
    "Introduce nothing they have not been taught. One mistake is not proof they cannot do it: mix easy and harder rounds.",
    comment ? `The tutor adds: ${comment}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export type ReviewInput = {
  minutes: number;
  /** The tutor's own choice of skills; otherwise picked from the memory. */
  skillIds?: string[];
  comment?: string;
  by: SmartReview["by"];
  slot?: string;
};

/** What a review would practise and why, before anything is made. */
export async function previewReview(student: Student, input: Pick<ReviewInput, "minutes" | "skillIds">) {
  const lessons = await listLessons(student.id);
  const picks = pickForReview(student.skills, { minutes: input.minutes, only: input.skillIds });
  return { picks, covered: coveredLately(lessons) };
}

const DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });

/**
 * Make a review: the lesson, then its games. The games are built here and
 * kept as a draft - nothing reaches the child until it is sent. A review with
 * nothing to practise is not made at all.
 */
export async function makeSmartReview(student: Student, input: ReviewInput): Promise<{ lesson: Lesson; built: boolean } | { error: string }> {
  const lessons = await listLessons(student.id);
  const picks = pickForReview(student.skills, { minutes: input.minutes, only: input.skillIds });
  if (!picks.length) return { error: "Nothing to review yet: skills appear once a lesson has been reviewed." };
  const covered = coveredLately(lessons);
  const request = reviewRequest(picks, covered, input.minutes, input.comment);
  const now = new Date().toISOString();
  const newest = withIds(student.skills)
    .flatMap((s) => (s.evidence ?? []).map((e) => e.at))
    .sort()
    .at(-1);
  const review: SmartReview = {
    reason: picks.map((p) => `${p.skill.topic}: ${p.why}`).join(" · "),
    skillIds: picks.map((p) => p.skill.id!),
    minutes: input.minutes,
    by: input.by,
    ...(input.slot && { slot: input.slot }),
    ...(input.comment && { comment: input.comment }),
    ...(newest && { builtOn: newest }),
  };
  const lesson = await createLesson({
    title: `Smart Review · ${DATE.format(new Date(now))}`,
    kind: "practice",
    request,
    review,
    studentId: student.id,
    mode: "online",
    // Nothing is recorded; the field only has to say so.
    capture: "tutor",
    language: DEFAULT_LANGUAGE,
    startedAt: now,
    endedAt: now,
  });
  await updateLesson(lesson.id, { homework: { focus: "Going back over what you have learnt" } });
  return { lesson, built: await buildReviewGames(lesson.id, student, input.minutes) };
}

/**
 * Build (or build again) a review's games, unless the child has started. A
 * five-minute review gets the short version of each game.
 */
export async function buildReviewGames(lessonId: string, student: Student, minutes: number): Promise<boolean> {
  const lesson = await getLesson(lessonId);
  if (!lesson?.review || lesson.homework?.results?.length || lesson.homework?.answers) return false;
  const learner: Student = minutes <= 5 ? { ...student, profile: { ...student.profile, shortTasks: true } } : student;
  try {
    // Counted as a Smart Review in the usage log (admin → Usage).
    const exercises = await withUsage(
      { purpose: "smart_review", studentId: student.id, tutorId: student.tutorId, lessonId },
      () => buildExercises(lesson, learner, []),
    );
    if (!exercises.length) return false;
    // Each game counts toward the skills the review was made for.
    const linked = exercises.map((e) => ({ ...e, skillIds: e.skillIds?.length ? e.skillIds : lesson.review!.skillIds }));
    const saved = await updateLesson(lessonId, (current) =>
      current.homework?.results?.length || current.homework?.answers
        ? null
        : { homework: { ...(current.homework ?? { focus: "" }), exercises: linked }, autoFailed: undefined },
    );
    return Boolean(saved);
  } catch (e) {
    console.error("[review] games", e);
    const error = e instanceof Error ? e.message : "The games could not be built.";
    await updateLesson(lessonId, { autoFailed: { at: new Date().toISOString(), error } }).catch(() => {});
    return false;
  }
}

/**
 * Where a review stands, for the tutor: made but not sent, waiting for the
 * child, being played, done - or set aside by the tutor or the queue.
 */
export function reviewState(lesson: Lesson): { state: string; tone: string } {
  const r = lesson.review;
  const h = lesson.homework;
  if (r?.state === "skipped") return { state: "Skipped", tone: "t-muted" };
  if (r?.state === "archived") return { state: "Archived", tone: "t-muted" };
  if (r?.state === "deferred") return { state: "Deferred", tone: "t-muted" };
  if (lesson.autoFailed && !h?.exercises?.length) return { state: "Failed - try again", tone: "text-warn" };
  if (!h?.exercises?.length) return { state: "Making games", tone: "t-muted" };
  if (!h.sentAt) return { state: "Draft - check and send", tone: "text-warn" };
  const played = h.results?.length ?? 0;
  if (played >= h.exercises.length) return { state: "Done", tone: "text-live" };
  return { state: played ? "In progress" : "Sent", tone: "t-muted" };
}
