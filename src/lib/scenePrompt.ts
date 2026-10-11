import { z } from "zod";
import { MODEL_FAST, complete } from "./llm";
import type { GameStyle } from "./gameStyles";
import type { Lesson } from "./types";

const SceneSchema = z.object({
  scene: z
    .string()
    .min(20)
    .max(600)
    .describe("The picture, in English, as one paragraph for an image model"),
});

const SYSTEM = `You describe one picture for a child's English homework.

The child will look at it and answer three things: describe what you see, say
what you think will happen next, and give three adjectives for the situation.
So the picture must:
- show a single clear moment with something happening - people or animals in
  the middle of doing something, not a calm landscape;
- leave an obvious "what happens next" (a ball about to land, a cake about to
  fall, a storm arriving, someone about to open a door);
- have a mood that invites adjectives (busy, messy, surprising, cosy, windy);
- give the child words to practise from this lesson - if they struggled with
  the past tense, show actions that are easy to narrate; if the lesson was
  about food, put food in it.

Rules:
- Safe and friendly for a 9-year-old. No violence, weapons, injury, fear,
  romance, religion or politics, whatever the lesson discussed.
- No text, signs, letters or numbers anywhere in the picture.
- Never name a game, brand, film or character. Describe what things look like.
- One paragraph, concrete and visual: who, doing what, where, what is about
  to happen. 40 to 90 words.`;

/**
 * The scene for a lesson's homework picture, from the summary rather than the
 * raw transcript: shorter, already free of the student's name, and it says
 * what was hard. A previous scene can be passed so a redraw differs.
 */
export async function writeScene(
  lesson: Lesson,
  style: GameStyle,
  previous?: string,
): Promise<string> {
  const s = lesson.summary;
  const user = [
    `Lesson topics: ${s?.covered.join("; ") || "general English"}`,
    `What was hard: ${s?.struggles.map((x) => x.what).join("; ") || "nothing recorded"}`,
    s?.homeworkFocus ? `Practice focus: ${s.homeworkFocus}` : "",
    previous ? `\nA different scene from this one, which was used already:\n${previous}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const { scene } = await complete({
    system: SYSTEM,
    user,
    schema: SceneSchema,
    schemaName: "Scene",
    model: MODEL_FAST,
    effort: "low",
    maxTokens: 3000,
  });
  return scene;
}

/** The full prompt: the scene, then how it should look. */
export function picturePrompt(scene: string, style: GameStyle): string {
  return `${scene}\n\nStyle: ${style.imageStyle}. Clear composition, one moment, no text anywhere.`;
}
