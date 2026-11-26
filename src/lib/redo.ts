import { unassessed } from "./homework";
import { updateStudent } from "./store";
import type { Exercise, Lesson, RedoItem, RoundAnswer, Student } from "./types";

/**
 * Mistakes carried from one homework into the next.
 *
 * The tutor reads a handed-in homework and taps "Practise these next time":
 * the rounds the learner got wrong are kept on the learner, and the next
 * homework built for them works them in - by the model alongside the
 * lesson's own point, or, for sums made by code, as the very same sums.
 * Once a later homework is built they have done their job and go.
 */

/** A few mistakes come back; a page of them would crowd out the lesson. */
const PER_HOMEWORK = 8;
const KEPT = 12;

/** Games with nothing to get wrong, or no one right answer to bring back. */
const NOT_CARRIED = new Set(["kindness", "speak"]);

/** The answer the round wanted, read from the game the learner played. */
export function correctFor(exercise: Exercise, round: RoundAnswer): string | undefined {
  switch (exercise.kind) {
    case "choose": {
      const r = exercise.rounds.find((x) => x.sentence === round.asked);
      return r ? r.options[r.answer] : undefined;
    }
    case "words": {
      const r = exercise.rounds.find((x) => x.meaning === round.asked);
      return r ? r.options[r.answer] : undefined;
    }
    case "questions":
    case "recall": {
      const r = exercise.rounds.find((x) => x.question === round.asked);
      return r ? r.options[r.answer] : undefined;
    }
    case "catch": {
      const r = exercise.rounds.find((x) => x.word === round.asked);
      return r ? (r.keep ? "kept it" : "sent it away") : undefined;
    }
    // What was asked is the answer: the sentence in order, the events in
    // order, the line to say.
    case "build":
    case "order":
    case "repeat":
    case "dialogue":
      return round.asked;
    default:
      return undefined;
  }
}

/** The rounds this homework got wrong, as they would be kept. */
export function mistakesOf(lesson: Lesson): RedoItem[] {
  const homework = lesson.homework;
  const now = new Date().toISOString();
  const out: RedoItem[] = [];
  const seen = new Set<string>();
  for (const result of homework?.results ?? []) {
    if (NOT_CARRIED.has(result.kind)) continue;
    const exercise = homework?.exercises?.find((e) => e.kind === result.kind);
    for (const round of result.rounds ?? []) {
      // Not marked (skipped, nothing heard) is not a mistake to practise.
      if (round.right || round.kindest !== undefined || unassessed(result.kind, round)) continue;
      const key = `${result.kind}:${round.asked}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const correct = exercise ? correctFor(exercise, round) : undefined;
      out.push({
        fromLesson: lesson.id,
        kind: result.kind,
        topic: result.topic,
        asked: round.asked,
        answered: round.answered,
        ...(correct && { correct }),
        savedAt: now,
      });
    }
  }
  return out.slice(0, PER_HOMEWORK);
}

/** Keep this homework's mistakes for the next one. Replaces any kept before from it. */
export async function rememberMistakes(student: Student, lesson: Lesson): Promise<RedoItem[]> {
  const items = mistakesOf(lesson);
  if (!items.length) return [];
  await updateStudent(student.id, (s) => {
    const rest = (s.redo ?? []).filter((r) => r.fromLesson !== lesson.id);
    // Newest kept when there are too many: the older ones have had their turn.
    return { redo: [...rest, ...items].slice(-KEPT) };
  });
  return items;
}

/** Take them back, as long as no homework has used them yet. */
export async function forgetMistakes(studentId: string, lessonId: string): Promise<void> {
  await updateStudent(studentId, (s) => {
    const before = s.redo ?? [];
    const redo = before.filter((r) => r.fromLesson !== lessonId || r.usedIn);
    return redo.length === before.length ? null : { redo };
  });
}

/** What this homework's games should bring back. */
export function redoFor(student: Pick<Student, "redo">, lessonId: string): RedoItem[] {
  return (student.redo ?? []).filter(
    (r) => r.fromLesson !== lessonId && (!r.usedIn || r.usedIn === lessonId),
  );
}

/**
 * This homework was built with them. They stay tied to it while it can be
 * built again; anything an earlier homework already used goes.
 */
export async function markUsed(studentId: string, lessonId: string, used: RedoItem[]): Promise<void> {
  const keys = new Set(used.map((r) => `${r.fromLesson}:${r.kind}:${r.asked}`));
  await updateStudent(studentId, (s) => {
    if (!s.redo?.length) return null;
    const redo = s.redo
      .filter((r) => !r.usedIn || r.usedIn === lessonId)
      .map((r) => (keys.has(`${r.fromLesson}:${r.kind}:${r.asked}`) ? { ...r, usedIn: lessonId } : r));
    return { redo };
  });
}

/** For the model: what to bring back, and how. */
export function describeRedo(items: RedoItem[]): string {
  if (!items.length) return "";
  const lines = items.map((r) => {
    const right = r.correct && r.correct !== r.asked ? `, the right answer is "${r.correct}"` : "";
    return `- "${r.asked}": they answered "${r.answered}"${right}`;
  });
  return [
    "Mistakes from their earlier homework that the tutor wants practised again.",
    "Give them at least two rounds, alongside today's point: the same thing to",
    "get right, in new words or new numbers - one round may ask the very same",
    "question again. Keep every limit above (numbers, level) as it is.",
    ...lines,
  ].join("\n");
}

/** The tutor's state of this homework's mistakes: none kept, kept and waiting, or used. */
export function redoState(
  student: Pick<Student, "redo">,
  lessonId: string,
): { kept: number; usedIn?: string } {
  const mine = (student.redo ?? []).filter((r) => r.fromLesson === lessonId);
  return { kept: mine.length, usedIn: mine.find((r) => r.usedIn)?.usedIn };
}
