import { z } from "zod";
import { MODEL, complete } from "./llm";
import { renderLesson } from "./summarize";
import type { Lesson, ParentMessage, Student } from "./types";

const MessageSchema = z.object({
  en: z.string().describe("The message in English"),
  zh: z.string().describe("The same message in Simplified Chinese"),
});

const TranslationSchema = z.object({
  zh: z.string().describe("The message in Simplified Chinese"),
});

const SYSTEM = `You write the short message a tutor sends a parent on WeChat
straight after a lesson.

- Three or four sentences. It is read on a phone, between other things.
- What the lesson covered, one thing the child did well, one thing still being
  worked on - in plain words, no grammar terms a parent would not use.
- If there is a simple thing the parent could do at home, end with it.
- Warm and specific. No filler ("great lesson today!"), no exclamation marks
  stacked up, no drama about mistakes.
- Use the child's name. Write as the tutor, in the first person.
- Only say what the lesson and debrief support. Leave a point out rather than
  invent it.

Write it in English, then give a natural Simplified Chinese version of exactly
the same message - what a Chinese parent would expect to read, not a word-for-
word translation.`;

const TRANSLATE = `Translate a tutor's WeChat message to a parent into natural
Simplified Chinese. Keep the meaning exactly, including anything the tutor
added or removed. Do not add or drop content. Keep the child's name as written.`;

export async function writeParentMessage(
  lesson: Lesson,
  student: Student,
): Promise<ParentMessage> {
  const parsed = await complete({
    system: SYSTEM,
    user: renderLesson(lesson, student),
    schema: MessageSchema,
    schemaName: "ParentMessage",
    maxTokens: 6000,
    effort: "low",
  });
  return { ...parsed, generatedAt: new Date().toISOString(), model: MODEL };
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
