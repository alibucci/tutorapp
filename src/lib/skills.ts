import { z } from "zod";
import { complete } from "./llm";
import { renderLesson } from "./summarize";
import { findSkill, newSkillId, recordLesson, sortSkills, withIds } from "./memory";
import { SKILL_AREAS, type Lesson, type Skill, type SkillChange, type Student } from "./types";

const StatusSchema = z.enum(["struggling", "improving", "solid"]);

const ChangesSchema = z.object({
  changes: z.array(
    z.object({
      same_as: z
        .string()
        .describe("The id of the tracked skill this is, when it is the same skill under any wording; otherwise empty"),
      topic: z
        .string()
        .describe(
          "Short name of the skill. Reuse an existing skill's exact wording when it is the same skill.",
        ),
      area: z.enum(SKILL_AREAS).catch("other").describe("What kind of skill this is"),
      parent: z
        .string()
        .describe('The broader skill it belongs to ("Past Simple" for "irregular verbs"), or empty'),
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
- A topic is a SKILL - something the student can do - not the lesson's theme.
  "Naming zoo animals" (vocabulary) or "it can + verb" (grammar), never
  "Animals at the zoo".
- When the lesson is about a skill already tracked, give its id in same_as and
  reuse its exact wording - even if the lesson said it differently. "Past
  tense: went, saw" and "irregular past tense verbs" are one skill. Only make
  a new skill when nothing on the list is the same thing.
- Keep a skill general enough to come back to ("irregular past tense verbs",
  not "went, saw, had, slept"); the examples belong in the note.
- parent is the broader skill when this is a part of one: "Past Simple" for
  "irregular past tense verbs". Leave it empty otherwise.
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
  return withIds(skills)
    .map((s) => `- id ${s.id}: ${s.topic}${s.parent ? ` (part of ${s.parent})` : ""} [${s.status}${s.area ? `, ${s.area}` : ""}] - ${s.note}`)
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
    effort: "low",
    outputLanguage: "English",
  });

  const skills = withIds(student.skills);
  return parsed.changes.map((c) => {
    // The model's match first, then the name: either way, one skill stays one.
    const existing = findSkill(skills, c.same_as) ?? findSkill(skills, c.topic);
    return {
      ...(existing && { skillId: existing.id }),
      topic: existing?.topic ?? c.topic.trim(),
      area: c.area,
      ...(c.parent.trim() && { parent: c.parent.trim() }),
      from: existing?.status,
      to: c.to,
      note: c.note,
      practice: c.practice || undefined,
      reason: c.reason,
    };
  });
}

/**
 * Fold accepted changes into the student's skills. Each change is matched to
 * the skill it is about (by id, then name, then meaning), so the same skill
 * worded two ways stays one skill; the lesson is kept as evidence.
 */
export function applySkillChanges(
  skills: Skill[],
  changes: SkillChange[],
  lessonId: string,
  now = new Date().toISOString(),
): Skill[] {
  const next = withIds(skills).map((s) => ({ ...s }));

  for (const change of changes) {
    const at = next.findIndex((s) => s === (findSkill(next, change.skillId ?? "") ?? findSkill(next, change.topic)));
    if (at >= 0) {
      const existing = next[at];
      next[at] = recordLesson(
        {
          ...existing,
          status: change.to,
          note: change.note,
          practice: change.practice,
          lastSeen: now,
          lessonIds: existing.lessonIds.includes(lessonId) ? existing.lessonIds : [...existing.lessonIds, lessonId],
          // What the tutor already set is kept; the model only fills gaps.
          area: existing.area ?? change.area,
          parent: existing.parent ?? change.parent,
        },
        lessonId,
        change.to,
        now,
        change.reason,
      );
    } else {
      next.push(
        recordLesson(
          {
            id: newSkillId(change.topic, now),
            topic: change.topic,
            status: change.to,
            note: change.note,
            practice: change.practice,
            firstSeen: now,
            lastSeen: now,
            lessonIds: [lessonId],
            ...(change.area && { area: change.area }),
            ...(change.parent && { parent: change.parent }),
          },
          lessonId,
          change.to,
          now,
          change.reason,
        ),
      );
    }
  }

  return sortSkills(next);
}

// ---------------------------------------------------------------------------
// Tidying: skills that are really one
// ---------------------------------------------------------------------------

const MergeSchema = z.object({
  groups: z.array(
    z.object({
      keep: z.string().describe("The id of the skill to keep"),
      merge: z.array(z.string()).describe("The ids of the other skills that are the same skill"),
      name: z.string().describe("The name the kept skill should have: general, with no list of examples"),
      area: z.enum(SKILL_AREAS).catch("other"),
      parent: z.string().describe('The broader skill it belongs to ("Past Simple"), or empty'),
      why: z.string().describe("One line for the tutor"),
    }),
  ),
});

const MERGE_SYSTEM = `You tidy the list of skills a tutor tracks for one student.
Some entries describe the same skill in different words, e.g. "Using irregular
past tense verbs", "Past tense: went, saw, had, slept" and "Correct past tense
forms: went, saw, ate" are one skill.

Group only entries that are truly the same skill. A broader skill and a part of
it ("Past Simple" and "irregular verbs") are not the same: leave them apart.
When unsure, leave them apart - the tutor checks every group. Keep the entry
the tutor has worked on most (more lessons) and give it a general name, without
lists of examples. An empty list of groups is a correct answer.`;

export type MergeProposal = z.infer<typeof MergeSchema>["groups"][number];

/** Groups of skills the model thinks are one. Writes nothing: the tutor decides. */
export async function proposeMerges(student: Student): Promise<MergeProposal[]> {
  const skills = withIds(student.skills);
  if (skills.length < 2) return [];
  const parsed = await complete({
    system: MERGE_SYSTEM,
    user: skills
      .map((s) => `- id ${s.id}: ${s.topic} [${s.status}, ${s.lessonIds.length} lessons]${s.parent ? ` part of ${s.parent}` : ""} - ${s.note}`)
      .join("\n"),
    schema: MergeSchema,
    schemaName: "SkillMerges",
    maxTokens: 4000,
    effort: "low",
    outputLanguage: "English",
  });
  const ids = new Set(skills.map((s) => s.id));
  const used = new Set<string>();
  // Only real ids, each in one group at most, and a group of two or more.
  return parsed.groups
    .map((g) => ({ ...g, merge: [...new Set(g.merge)].filter((id) => ids.has(id) && id !== g.keep && !used.has(id)) }))
    .filter((g) => ids.has(g.keep) && !used.has(g.keep) && g.merge.length > 0)
    .map((g) => {
      [g.keep, ...g.merge].forEach((id) => used.add(id));
      return { ...g, name: g.name.trim(), parent: g.parent.trim() };
    });
}
