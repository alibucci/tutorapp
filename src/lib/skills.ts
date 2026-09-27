import { z } from "zod";
import { complete } from "./llm";
import { renderLesson } from "./summarize";
import type { Lesson, Skill, SkillChange, Student } from "./types";

const StatusSchema = z.enum(["struggling", "improving", "solid"]);

const ChangesSchema = z.object({
  changes: z.array(
    z.object({
      topic: z
        .string()
        .describe(
          "Short topic name. Reuse an existing topic's exact wording when this is the same skill.",
        ),
      to: StatusSchema,
      note: z
        .string()
        .describe(
          "One line the student reads, phrased as a goal, never as a verdict about them",
        ),
      practice: z
        .string()
        .describe("One concrete thing to practise, or an empty string"),
      reason: z
        .string()
        .describe("Why this lesson justifies the change - for the tutor only"),
    }),
  ),
});

const SYSTEM = `You maintain a running picture of what one tutoring student can
and cannot do yet.

You are given the topics already tracked for this student and the summary of the
lesson that just happened. Propose only the changes this lesson justifies.

Rules:
- Reuse an existing topic's exact wording when the lesson is about that same
  skill. Only invent a topic name when nothing on the list fits.
- Propose a change only where the lesson gives evidence. One lesson rarely moves
  more than two or three topics. An empty list is a correct answer.
- "solid" means the tutor's words show the student doing it unaided. One good
  answer is "improving", not "solid".
- The note is read by a child. Write the goal, not the deficiency: "adding
  fractions with different denominators" rather than "cannot add fractions" or
  "weak at fractions". No praise, no blame, no labels about the student.
- The practice line is one concrete, finishable task.
- The reason is for the tutor and may be blunt.

The transcript may be tutor-only audio, or it may carry both voices with each
line labelled. Where you have the student's own words, use them - what they
actually said is better evidence than the tutor's description of it. Where you
only have the tutor, do not assert more than the tutor's words support.`;

function renderSkills(skills: Skill[]): string {
  if (!skills.length) return "(nothing tracked yet - this is the first lesson)";
  return skills
    .map((s) => `- ${s.topic} [${s.status}] - ${s.note}`)
    .join("\n");
}

/**
 * Propose updates to the student model. Nothing is written here: the tutor sees
 * these on the lesson review page and accepts them before they reach anyone.
 */
export async function proposeSkillChanges(
  lesson: Lesson,
  student: Student,
): Promise<SkillChange[]> {
  if (!lesson.summary) return [];

  const input = [
    `Student: ${student.name}`,
    "",
    "=== TOPICS ALREADY TRACKED ===",
    renderSkills(student.skills),
    "",
    "=== LESSON THAT JUST HAPPENED ===",
    renderLesson(lesson, student),
    "",
    "=== SUMMARY OF THAT LESSON ===",
    JSON.stringify(lesson.summary, null, 2),
  ].join("\n");

  const parsed = await complete({
    system: SYSTEM,
    user: input,
    schema: ChangesSchema,
    schemaName: "SkillChanges",
    maxTokens: 8000,
    outputLanguage: "English",
  });

  const byTopic = new Map(student.skills.map((s) => [s.topic, s]));
  return parsed.changes.map((c) => ({
    topic: c.topic,
    from: byTopic.get(c.topic)?.status,
    to: c.to,
    note: c.note,
    practice: c.practice || undefined,
    reason: c.reason,
  }));
}

/** Fold accepted changes into the student's topic list. */
export function applySkillChanges(
  skills: Skill[],
  changes: SkillChange[],
  lessonId: string,
  now = new Date().toISOString(),
): Skill[] {
  const next = skills.map((s) => ({ ...s }));

  for (const change of changes) {
    const existing = next.find((s) => s.topic === change.topic);
    if (existing) {
      existing.status = change.to;
      existing.note = change.note;
      existing.practice = change.practice;
      existing.lastSeen = now;
      if (!existing.lessonIds.includes(lessonId)) {
        existing.lessonIds.push(lessonId);
      }
    } else {
      next.push({
        topic: change.topic,
        status: change.to,
        note: change.note,
        practice: change.practice,
        firstSeen: now,
        lastSeen: now,
        lessonIds: [lessonId],
      });
    }
  }

  // Needs work first - that is what the student's screen is for.
  const order = { struggling: 0, improving: 1, solid: 2 } as const;
  return next.sort(
    (a, b) =>
      order[a.status] - order[b.status] || b.lastSeen.localeCompare(a.lastSeen),
  );
}
