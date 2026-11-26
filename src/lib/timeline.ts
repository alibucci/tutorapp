import { gameScore, homeworkDone } from "./homework";
import type { Lesson, Skill, SkillStatus, Student } from "./types";

/**
 * A child's lessons in order, with only what was really recorded about each:
 * the date, what was covered, how the homework went, which topics it touched.
 * No new model call and no made-up "progress" number - the topic statuses are
 * judgements, not measurements, so they are shown as words.
 */

export type TimelineItem = {
  id: string;
  date: string;
  title: string;
  /** "lesson", "group lesson", "Bible story", "extra homework". */
  kind: string;
  covered: string[];
  /** One line on what mattered, from the summary. */
  line?: string;
  /** Homework games, when the child finished them. */
  score?: { right: number; total: number };
  /** Sent and not finished yet. */
  homeworkOpen?: boolean;
  topics: { topic: string; status: SkillStatus }[];
};

export type Timeline = {
  items: TimelineItem[];
  taught: number;
  solid: number;
  working: number;
  homeworkDone: number;
};

function kindOf(lesson: Lesson): string {
  if (lesson.module) return "Bible story";
  if (lesson.kind === "practice") return "extra homework";
  if (lesson.groupStudentIds?.length) return "group lesson";
  return "lesson";
}

/** The tutor's timeline: every lesson that was taught or set as homework. */
export function tutorTimeline(student: Pick<Student, "skills">, lessons: Lesson[]): Timeline {
  const shown = lessons
    .filter((l) => l.kind !== "intro" && (l.summary || l.homework?.sentAt))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const items = shown.map((l) => item(l, student.skills));
  return {
    items,
    taught: shown.filter((l) => l.kind !== "practice" && l.summary).length,
    solid: student.skills.filter((s) => s.status === "solid").length,
    working: student.skills.filter((s) => s.status !== "solid").length,
    homeworkDone: shown.filter((l) => homeworkDone(l.homework)).length,
  };
}

function item(l: Lesson, skills: Skill[]): TimelineItem {
  const score = gameScore(l.homework);
  return {
    id: l.id,
    date: l.createdAt,
    title: l.title,
    kind: kindOf(l),
    covered: l.summary?.covered ?? [],
    ...(l.summary?.whatMatters && { line: l.summary.whatMatters }),
    ...(homeworkDone(l.homework) && score.total > 0 && { score: { right: score.right, total: score.total } }),
    ...(l.homework?.sentAt && !homeworkDone(l.homework) && { homeworkOpen: true }),
    topics: skills.filter((s) => s.lessonIds.includes(l.id)).map((s) => ({ topic: s.topic, status: s.status })),
  };
}

export type ParentItem = { id: string; date: string; title: string; line: string; score?: { right: number; total: number } };

/**
 * The parent's, shorter: only lessons whose note the tutor has sent, each
 * with the first sentence of that note - already written for a parent - and
 * the homework score. Nothing the tutor has not let out.
 */
export function parentTimeline(lessons: Lesson[]): ParentItem[] {
  return lessons
    .filter((l) => l.parentMessage?.copiedAt && l.parentMessage.en.trim())
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((l) => {
      const score = gameScore(l.homework);
      return {
        id: l.id,
        date: l.createdAt,
        title: l.title,
        line: firstSentence(l.parentMessage!.en),
        ...(homeworkDone(l.homework) && score.total > 0 && { score: { right: score.right, total: score.total } }),
      };
    });
}

function firstSentence(text: string): string {
  const line = text.trim().split(/\n+/)[0];
  const m = line.match(/^.{20,}?[.!?](\s|$)/);
  const s = (m ? m[0] : line).trim();
  return s.length > 220 ? `${s.slice(0, 219).trimEnd()}…` : s;
}
