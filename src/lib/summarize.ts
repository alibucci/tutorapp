import { z } from "zod";
import { MODEL, complete } from "./llm";
import type { Lesson, LessonSummary, Student } from "./types";
import { DEBRIEF_PROMPTS } from "./types";

export { MODEL } from "./llm";

const Note = z.object({
  what: z.string(),
  evidence: z
    .string()
    .describe("A short quote or paraphrase from the lesson or debrief"),
});

const SummarySchema = z.object({
  covered: z.array(z.string()).describe("Topics and skills actually taught"),
  struggles: z.array(Note),
  improvements: z.array(Note),
  teachingSignals: z
    .array(
      z.object({
        correction: z
          .string()
          .describe("A correction the tutor made during the lesson"),
        concept: z.string().describe("The underlying concept it points at"),
      }),
    )
    .describe("Corrections the tutor made in the moment - the teaching signal"),
  whatMatters: z
    .string()
    .describe("The tutor's own judgement about what matters, in 1-2 sentences"),
  nextLesson: z.array(z.string()).describe("Concrete next steps"),
});

const COMMON = `The debrief is the tutor's own 60-second reflection recorded
straight after the lesson. It carries judgement the transcript cannot: where the
two disagree about what mattered, follow the debrief.

Quote or closely paraphrase real words for every evidence field. Never fabricate
evidence. An empty array is a correct answer when the source says nothing.

This summary is for the tutor. Be direct and diagnostic.`;

const SYSTEM_TUTOR_ONLY = `You summarise one-to-one tutoring sessions.

Your input is TUTOR-ONLY audio: the transcript contains only what the tutor
said, so the student's turns are absent. Infer what the student did only from
what the tutor's words imply - corrections, restatements, praise,
re-explanations. Where the tutor's words do not support a conclusion, leave it
out rather than guessing.

${COMMON}`;

const SYSTEM_BOTH = `You summarise one-to-one tutoring sessions.

Both voices were recorded, so you have the student's own words. Lines are
labelled TUTOR and STUDENT; some are UNKNOWN because the labeller could not tell.

Use what the student actually said. When you report a misconception, quote the
student's own wording rather than the tutor's description of it - the wording is
the diagnosis. Where a line is UNKNOWN, do not attribute it to either person.

The labels come from a text-only pass over the transcript and are occasionally
wrong. If a line's label contradicts its obvious content, trust the content.

${COMMON}`;

export function formatMs(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = String(Math.floor(total / 60)).padStart(2, "0");
  const s = String(total % 60).padStart(2, "0");
  return `${m}:${s}`;
}

function speakerTag(seg: { speaker?: string }, student: Student): string {
  if (seg.speaker === "tutor") return "TUTOR";
  if (seg.speaker === "student") return student.name.toUpperCase();
  return "UNKNOWN";
}

export function renderLesson(lesson: Lesson, student: Student): string {
  const both = lesson.capture === "both";
  const transcript = lesson.transcript.length
    ? lesson.transcript
        .map((s) =>
          both
            ? `[${formatMs(s.t)}] ${speakerTag(s, student)}: ${s.text}`
            : `[${formatMs(s.t)}] ${s.text}`,
        )
        .join("\n")
    : "(no lesson transcript captured)";

  const debrief = lesson.debrief.length
    ? lesson.debrief
        .map((a) => {
          const prompt = DEBRIEF_PROMPTS.find((p) => p.id === a.promptId);
          return `Q: ${prompt?.label ?? a.promptId}\nA: ${a.text || "(no answer)"}`;
        })
        .join("\n\n")
    : "(no debrief recorded)";

  return [
    `Lesson: ${lesson.title}`,
    `Student: ${student.name}`,
    `Mode: ${lesson.mode}`,
    "",
    both
      ? "=== LESSON TRANSCRIPT (both voices) ==="
      : "=== TUTOR AUDIO TRANSCRIPT ===",
    transcript,
    "",
    "=== 60-SECOND POST-LESSON DEBRIEF ===",
    debrief,
  ].join("\n");
}

export async function summarizeLesson(
  lesson: Lesson,
  student: Student,
): Promise<LessonSummary> {
  const parsed = await complete({
    system: lesson.capture === "both" ? SYSTEM_BOTH : SYSTEM_TUTOR_ONLY,
    user: renderLesson(lesson, student),
    schema: SummarySchema,
    schemaName: "LessonSummary",
    outputLanguage: "English",
  });

  return { ...parsed, generatedAt: new Date().toISOString(), model: MODEL };
}
