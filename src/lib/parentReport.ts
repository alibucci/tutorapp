import { randomUUID } from "crypto";
import { z } from "zod";
import { MODEL, complete } from "./llm";
import type { Lesson, ParentReport, Skill, Student } from "./types";

const BodySchema = z.object({
  trajectory: z
    .string()
    .describe(
      "Two or three sentences on what moved this week. This is the question the parent is actually asking.",
    ),
  strengths: z
    .array(z.string())
    .describe(
      "What this child is genuinely good at - stable strengths, not this week's wins",
    ),
  wins: z.array(z.string()).describe("What the child can now do that they could not before"),
  working: z.array(z.string()).describe("What is being worked on, framed as in progress"),
  atHome: z
    .array(z.string())
    .describe("One to three specific things a parent can do, never 'practise more'"),
});

const SYSTEM = `You write a short weekly note from a tutor to a parent about
their child.

The parent's real question is not "what is wrong with my child" - it is "is this
working, and is my money well spent". Answer that question first, honestly.

Rules:
- Lead with movement. What changed this week, in plain language a parent
  understands without knowing the curriculum.
- Name strengths explicitly. A parent wants to know what their child is good at,
  not only what is being fixed. Strengths are stable traits shown over several
  lessons - "explains their reasoning clearly", "spots patterns quickly" - not a
  restatement of this week's wins. Leave the list empty rather than inventing
  one.
- Be honest about difficulty, but describe it as work in progress, never as a
  deficiency in the child. "Still working out how to..." not "cannot" or "is
  weak at". The parent should finish this section knowing exactly where the gaps
  are - vagueness is not kindness - but never reading a verdict on the child.
- Never label the child. No "struggling student", no ability judgements, no
  comparison to other children or to a grade level.
- A week with little progress is a real outcome. Say so plainly and say what the
  plan is. Do not manufacture progress that the evidence does not show.
- The at-home items must be specific and finishable in a few minutes. "Ask them
  to explain how they got the answer" beats "practise more".
- No jargon, no bullet-point padding, no praise inflation. A parent can tell.

Where the lesson recorded the child as well as the tutor, one short quote of
something the child said is worth more than a paragraph of description - a
parent recognises their own child's words. Use at most one, and only where it
shows something real. Never quote a mistake to embarrass; quote understanding
arriving.

Do not state anything the recording does not support.

This is a draft. The tutor reads and edits it before the parent ever sees it.`;

function renderWeek(lessons: Lesson[], skills: Skill[]): string {
  const bodies = lessons
    .map((lesson, i) => {
      const summary = lesson.summary;
      return [
        `--- Lesson ${i + 1}: ${lesson.title} (${lesson.createdAt.slice(0, 10)}) ---`,
        summary
          ? JSON.stringify(summary, null, 2)
          : "(no summary generated for this lesson)",
      ].join("\n");
    })
    .join("\n\n");

  const topics = skills.length
    ? skills.map((s) => `- ${s.topic} [${s.status}] - ${s.note}`).join("\n")
    : "(no topics tracked yet)";

  return [
    "=== WHERE THE STUDENT STANDS NOW ===",
    topics,
    "",
    "=== LESSONS THIS WEEK ===",
    bodies || "(no lessons this week)",
  ].join("\n");
}

/** Monday 00:00 of the week containing `date`, and the Sunday that closes it. */
export function weekBounds(date: Date): { start: string; end: string } {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const dayFromMonday = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dayFromMonday);
  const end = new Date(d);
  end.setDate(end.getDate() + 6);
  return { start: toDate(d), end: toDate(end) };
}

function toDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function lessonsInWeek(
  lessons: Lesson[],
  start: string,
  end: string,
): Lesson[] {
  return lessons
    .filter((l) => {
      const day = l.createdAt.slice(0, 10);
      return day >= start && day <= end;
    })
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function draftParentReport(
  student: Student,
  lessons: Lesson[],
  start: string,
  end: string,
): Promise<ParentReport> {
  const parsed = await complete({
    system: SYSTEM,
    user: [
      `Child: ${student.name}`,
      `Week: ${start} to ${end}`,
      `Lessons this week: ${lessons.length}`,
      "",
      renderWeek(lessons, student.skills),
    ].join("\n"),
    schema: BodySchema,
    schemaName: "ParentReportBody",
    maxTokens: 8000,
    outputLanguage: "English",
  });

  return {
    id: randomUUID(),
    studentId: student.id,
    weekStart: start,
    weekEnd: end,
    lessonIds: lessons.map((l) => l.id),
    body: parsed,
    generatedAt: new Date().toISOString(),
    model: MODEL,
    editedByTutor: false,
  };
}
