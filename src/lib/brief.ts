import { z } from "zod";
import { MODEL, MODEL_FAST, complete } from "./llm";
import { homeworkDone, resultScore } from "./homework";
import { memoryState, recurringMistakes, withIds } from "./memory";
import { describePreferences } from "./profile";
import { withUsage } from "./usage";
import { EXERCISE_LABEL, MEMORY_STATE_LABEL, type LearningBrief, type Lesson, type Student } from "./types";

/**
 * "Before the next lesson": what the child did since the last lessons, what
 * keeps coming back, what is moving, and how to open the next lesson. Written
 * from confirmed data only - lesson summaries the tutor kept, marked answers,
 * the memory's states - and read by the tutor, never by the family.
 */

const WINDOW_DAYS = 14;
const DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });

function kindOf(l: Lesson): string {
  if (l.review) return "Smart Review";
  if (l.kind === "practice") return "extra homework";
  return "lesson homework";
}

/** Everything the brief may say, as plain lines. Nothing here is a guess. */
export function briefFacts(student: Student, lessons: Lesson[], now = Date.now()): { text: string; upTo?: string } {
  const since = now - WINDOW_DAYS * 86_400_000;
  const recent = lessons.filter((l) => Date.parse(l.createdAt) >= since);
  const taught = recent.filter((l) => l.kind !== "practice" && l.kind !== "intro" && l.summary);
  const practice = recent.filter((l) => l.homework?.sentAt);
  const lines: string[] = [];

  lines.push("LESSONS (from the tutor-checked summaries):");
  for (const l of taught) {
    lines.push(`- ${DATE.format(new Date(l.createdAt))} ${l.title}: covered ${l.summary!.covered.join(", ") || "-"}. ${l.summary!.whatMatters}`);
  }
  if (!taught.length) lines.push("- none in the last two weeks");

  lines.push("", "PRACTICE SENT (first-attempt answers that were marked; a game not played is NOT a mistake):");
  for (const l of practice) {
    const done = homeworkDone(l.homework);
    const games = (l.homework?.results ?? [])
      .map((r) => ({ r, s: resultScore(r, "first") }))
      .filter((x) => x.s.total > 0)
      .map((x) => `${EXERCISE_LABEL[x.r.kind]} on ${x.r.topic}: ${x.s.right}/${x.s.total}`);
    lines.push(`- ${kindOf(l)} "${l.title}" (${DATE.format(new Date(l.homework!.sentAt!))}): ${done ? "finished" : "NOT finished yet"}${games.length ? ` - ${games.join("; ")}` : ""}`);
  }
  if (!practice.length) lines.push("- none sent");

  const skills = withIds(student.skills);
  lines.push("", "SKILLS (the tutor's lesson status leads; homework only says when to go over it again):");
  for (const s of skills) {
    const practised = (s.evidence ?? []).filter((e) => e.source !== "lesson" && (e.total ?? 0) > 0).slice(-3);
    const again = recurringMistakes(s).slice(-3).map((m) => `"${m.answered}"${m.correct ? ` -> "${m.correct}"` : ""}`);
    lines.push(
      `- ${s.topic}: ${MEMORY_STATE_LABEL[memoryState(s, new Date(now).toISOString())]}` +
        (practised.length ? `; practice first go ${practised.map((e) => `${e.right}/${e.total}`).join(", ")}` : "; not practised in homework") +
        (again.length ? `; keeps coming back: ${again.join(", ")}` : ""),
    );
  }
  if (!skills.length) lines.push("- none tracked yet");

  const prefs = describePreferences(student.profile);
  if (prefs) lines.push("", prefs);

  const upTo = [...lessons.map((l) => l.createdAt), ...skills.flatMap((s) => (s.evidence ?? []).map((e) => e.at))].sort().at(-1);
  return { text: lines.join("\n"), ...(upTo && { upTo }) };
}

const BriefSchema = z.object({
  headline: z.string().min(10).max(500).describe("Two or three sentences: how the practice went and what matters for the next lesson"),
  covered: z.array(z.string().max(160)).max(6).describe("Material the lessons covered"),
  practiceDone: z.array(z.string().max(160)).max(6).describe("Practice activities the child finished, with how they went"),
  recurringMistakes: z.array(z.string().max(160)).max(5).describe("Mistakes that came back more than once, with the right form"),
  improving: z.array(z.string().max(160)).max(5).describe("Skills moving in the right direction, with the evidence"),
  needsPractice: z.array(z.string().max(160)).max(5).describe("Topics that need more practice"),
  unfinished: z.array(z.string().max(160)).max(5).describe("Activities sent but not finished - not mistakes"),
  warmup: z.string().min(5).max(300).describe("One concrete warm-up for the next lesson, a few minutes long"),
  objectives: z.array(z.string().max(160)).max(4).describe("Recommended learning objectives for the next lesson"),
});

const SYSTEM = `You write a short brief for a tutor before their next lesson
with one child. The tutor reads it in a minute and uses it to prepare.

Use ONLY the facts given. Rules:
- An activity not finished is not a mistake and says nothing about knowledge.
  List it under unfinished, nowhere else.
- One right answer is not mastery; one wrong answer is not a gap. Speak of a
  skill as improving or needing practice only where the facts show it more
  than once, or the tutor's lesson status says so.
- Recurring mistakes are the ones given as "keeps coming back" - quote them
  with the right form.
- The warm-up uses material the child has already been taught: a short
  speaking or storytelling task on the weak points, not a test.
- Plain, warm, specific. No percentages, no labels about the child.
- Empty lists are fine where there is nothing to say.

Example of the tone: "Victor completed his recent Bible story activities.
Story comprehension is strong in the completed Day 1: Light assignment.
Sentence building and irregular past tense verbs require further practice.
Suggested next lesson warm-up: short storytelling activity using previously
learned vocabulary and past tense verbs."`;

/** Write the brief now and keep it on the learner. */
export async function writeBrief(student: Student, lessons: Lesson[]): Promise<LearningBrief> {
  const facts = briefFacts(student, lessons);
  const body = await withUsage({ purpose: "weekly_brief", studentId: student.id, tutorId: student.tutorId }, () =>
    complete({
      system: SYSTEM,
      user: `The child is called ${student.name}.\n\n${facts.text}`,
      schema: BriefSchema,
      schemaName: "LearningBrief",
      maxTokens: 4000,
      effort: "low",
      timeoutMs: 60_000,
      fallbackModel: MODEL_FAST,
      outputLanguage: "English",
    }),
  );
  return { ...body, at: new Date().toISOString(), ...(facts.upTo && { upTo: facts.upTo }), model: MODEL };
}
