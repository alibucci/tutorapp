import { z } from "zod";
import { MODEL, MODEL_FAST, complete } from "./llm";
import { quoteLine } from "./parentLines";
import { hasParent } from "./profile";
import { renderLesson } from "./summarize";
import { tutorListed } from "./tutorList";
import type { Lesson, ParentMessage, Student } from "./types";

const MessageSchema = z.object({
  en: z.string().describe("The message in English"),
  zh: z.string().describe("The same message in Simplified Chinese"),
});

/**
 * With candidate lines, the model also picks one - by number only. A number it
 * gets wrong is read as "none" rather than failing the message.
 */
const MessageWithQuoteSchema = MessageSchema.extend({
  quoteIndex: z
    .number()
    .int()
    .nullable()
    .optional()
    .catch(null)
    .describe("The number of the candidate line to quote, or null for none"),
});

const TranslationSchema = z.object({
  zh: z.string().describe("The message in Simplified Chinese"),
});

const SYSTEM = `You write the short message a tutor sends a parent on WeChat
straight after a lesson.

- Three to five sentences. It is read on a phone, between other things.
- What the lesson covered, one thing the child did well, one thing still being
  worked on - in plain words, no grammar terms a parent would not use.
- If there is a simple thing the parent could do at home, say it.
- What comes next: only from the tutor's answer to "What should happen next
  lesson?". If they answered it, mention it in one short clause, no promises
  about dates. If that answer is missing or empty, do not say anything about
  the next lesson or "next time" - not even guessed from the struggles.
- If you are told what the parent asked for, mention it in one sentence only
  when the lesson and the debrief show a step towards it - say what happened,
  not "as you wished". Otherwise say nothing about it. Never promise a result.
- Warm and specific. No filler ("great lesson today!"), no exclamation marks
  stacked up, no drama about mistakes.
- Use the child's name. Write as the tutor, in the first person.
- Only say what the lesson and debrief support. Leave a point out rather than
  invent it.

Write it in English, then give a natural Simplified Chinese version of exactly
the same message - what a Chinese parent would expect to read, not a word-for-
word translation.`;

const QUOTE_RULES = `

You are also given numbered lines the child said in the lesson. Pick the one
that best shows the child understanding something or taking a step forward,
and give its number as quoteIndex. Never pick a line with a mistake in it. If
none fits, give null. The line is added under your message word for word, so
do not repeat or retell it in the message itself.`;

const TRANSLATE = `Translate a tutor's WeChat message to a parent into natural
Simplified Chinese. Keep the meaning exactly, including anything the tutor
added or removed. Do not add or drop content. Keep the child's name as written.
Text inside quotation marks stays in English, unchanged.`;

// ---------------------------------------------------------------------------
// The child's own words
// ---------------------------------------------------------------------------

const QUOTE_MIN_WORDS = 3;
const QUOTE_MAX_WORDS = 15;
/** At most this many lines go to the model: the latest ones. */
const QUOTE_CANDIDATES = 10;
/** A line the recogniser was this unsure of is not quoted to a parent. */
const QUOTE_MIN_CONFIDENCE = 0.6;
/** Share of letters that must be Latin: an English line, not a Chinese one. */
const QUOTE_LATIN_SHARE = 0.6;

/**
 * Who gets the child's words in the message. Victor first (decided 20 Nov
 * 2026), then whoever he opens it to. PARENT_QUOTE_TUTORS holds tutor emails
 * or ids, comma-separated, or "*" for everyone - the same shape as
 * CHRISTIANITY_TUTORS. Unset: nobody, since only tutors have students.
 *
 * By the lesson's tutor, not a session: the message is written in the
 * background, after the request that triggered it has gone.
 */
export function quoteOpenTo(tutorId: string): Promise<boolean> {
  return tutorListed("PARENT_QUOTE_TUTORS", tutorId);
}

/**
 * Lines the child said that could be quoted, oldest first.
 *
 * Only where the child was recorded with consent and the lines are labelled
 * as theirs: a lesson in the room, one to one, or a child's own lesson from a
 * group (other children's lines are already gone from it). Never the shared
 * group recording, a first note, extra homework or a programme item.
 */
export function quoteCandidates(lesson: Lesson): string[] {
  if (lesson.capture !== "both") return [];
  if (lesson.kind === "group" || lesson.kind === "intro" || lesson.kind === "practice") return [];
  if (lesson.module) return [];
  const lines: string[] = [];
  for (const seg of lesson.transcript) {
    if (seg.speaker !== "student") continue;
    if (seg.confidence !== undefined && seg.confidence < QUOTE_MIN_CONFIDENCE) continue;
    const text = seg.text.trim().replace(/\s+/g, " ");
    const words = text.split(" ").length;
    if (words < QUOTE_MIN_WORDS || words > QUOTE_MAX_WORDS) continue;
    const letters = text.match(/\p{L}/gu)?.length ?? 0;
    const latin = text.match(/\p{Script=Latin}/gu)?.length ?? 0;
    if (letters === 0 || latin / letters < QUOTE_LATIN_SHARE) continue;
    if (!lines.includes(text)) lines.push(text);
  }
  return lines.slice(-QUOTE_CANDIDATES);
}

function renderCandidates(lines: string[]): string {
  return [
    "=== CANDIDATE LINES THE CHILD SAID, NUMBERED ===",
    ...lines.map((line, i) => `${i + 1}. ${line}`),
  ].join("\n");
}

/**
 * After the tutor edits the English: a quote still in it keeps its Chinese
 * line, in case the translation lost it; a quote deleted from it is gone.
 */
export function keepQuote(
  quote: string | undefined,
  name: string,
  en: string,
  zh: string,
): { en: string; zh: string; quote?: string } {
  if (!quote || !en.includes(quote)) return { en, zh };
  return {
    en,
    zh: zh.includes(quote) ? zh : `${zh.trim()}\n\n${quoteLine(name, quote).zh}`,
    quote,
  };
}

// ---------------------------------------------------------------------------
// Writing it
// ---------------------------------------------------------------------------

export async function writeParentMessage(
  lesson: Lesson,
  student: Student,
): Promise<ParentMessage> {
  // An adult learner has no parent: their message is never shown, so it gets
  // neither a quote nor a wish.
  const parent = hasParent(student);
  const candidates = parent && (await quoteOpenTo(student.tutorId)) ? quoteCandidates(lesson) : [];
  const wish = parent ? student.profile?.parentWish?.trim() : undefined;

  const user = [
    renderLesson(lesson, student),
    ...(wish ? ["", `The parent asked for: ${wish}`] : []),
    ...(candidates.length ? ["", renderCandidates(candidates)] : []),
  ].join("\n");

  const parsed = await complete({
    system: candidates.length ? SYSTEM + QUOTE_RULES : SYSTEM,
    user,
    schema: candidates.length ? MessageWithQuoteSchema : MessageSchema,
    schemaName: "ParentMessage",
    maxTokens: 6000,
    effort: "low",
    timeoutMs: 75_000,
    fallbackModel: MODEL_FAST,
  });

  // The words come from the list, never from the model's reply.
  const index = "quoteIndex" in parsed ? parsed.quoteIndex : null;
  const quote =
    typeof index === "number" && Number.isInteger(index) && index >= 1 && index <= candidates.length
      ? candidates[index - 1]
      : undefined;
  const line = quote ? quoteLine(student.name, quote) : null;

  return {
    en: line ? `${parsed.en.trim()}\n\n${line.en}` : parsed.en,
    zh: line ? `${parsed.zh.trim()}\n\n${line.zh}` : parsed.zh,
    generatedAt: new Date().toISOString(),
    model: MODEL,
    ...(quote && { quote }),
  };
}

/** Re-derive the Chinese after the tutor has edited the English. */
export async function translateParentMessage(en: string): Promise<string> {
  const { zh } = await complete({
    system: TRANSLATE,
    user: en,
    schema: TranslationSchema,
    schemaName: "Translation",
    maxTokens: 4000,
    effort: "low",
  });
  return zh;
}
