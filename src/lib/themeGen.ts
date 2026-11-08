import { z } from "zod";
import { readablePalette } from "./gameStyles";
import { MODEL_FAST, complete } from "./llm";
import { describeLearner, isChild } from "./profile";
import type { CustomStyle, Student } from "./types";

/**
 * A theme made for one learner from what the tutor wrote about them: the same
 * shape as the ready-made ones, so everything that draws a theme draws this.
 *
 * The rule about brands holds. A theme describes a look - "a restaurant kitchen
 * in warm light" - never a game, film, team or company: the picture service
 * refuses those, and we should not be using them. Its colours are checked for
 * contrast here, not trusted.
 */

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "a #rrggbb colour");

const ThemeSchema = z.object({
  name: z.string().min(2).max(32).describe("What to call this look, two or three words"),
  imageStyle: z
    .string()
    .min(40)
    .max(500)
    .describe("How pictures in this look are drawn, for an image model. No names of games, films, brands, teams or characters."),
  words: z.object({
    start: z.string().min(2).max(28),
    step: z.string().min(2).max(14),
    done: z.string().min(2).max(40),
    reward: z.string().min(2).max(14).describe("What a right answer earns, plural, e.g. 'stars'"),
    submit: z.string().min(2).max(24),
    cheer: z.string().min(2).max(28),
    heading: z.string().min(2).max(24),
  }),
  palette: z.object({
    ground: hex.describe("Behind everything"),
    panel: hex.describe("The card the text sits on"),
    ink: hex.describe("Text on the panel"),
    accent: hex.describe("Buttons and progress"),
    accentInk: hex.describe("Text on the accent"),
  }),
});

const SYSTEM = `You design the look of one learner's English homework, from what their
tutor says about them. The homework is a few short tasks on a phone.

Pick what they care about most and build the look around it: someone who runs a
restaurant gets a warm restaurant kitchen; a child who loves dinosaurs gets a
dinosaur valley. Not their job title - the world it lives in.

- name: two or three words, e.g. "Restaurant kitchen".
- imageStyle: how pictures in this look are drawn, concrete and visual: setting,
  colours, light, drawing style. Never name a game, film, book, brand, team,
  company or character - describe what things look like instead.
- words: the short words on the screen. For a child, playful and in the spirit
  of the theme ("Open the menu", "Course", "Chef's kiss!"). For a teenager or
  an adult, plain and respectful: no quests, levels or points ("Start",
  "Task", "Check").
- palette: five colours as #rrggbb. Text must be easy to read: dark ink on a
  light panel, and accentInk that stands out clearly on accent. The ground can
  be the strongest colour.
- Ignore anything about health or diagnoses in the tutor's note.
- Keep everything suitable for the learner's age.`;

export async function makeTheme(student: Student): Promise<CustomStyle> {
  const about = student.profile?.about ?? "";
  const theme = await complete({
    system: SYSTEM,
    user: `${describeLearner(student.name, student.profile)}\n${
      isChild(student.profile) ? "This homework is a game for a child." : "This homework is plain, not a game."
    }`,
    schema: ThemeSchema,
    schemaName: "Theme",
    model: MODEL_FAST,
    effort: "low",
    maxTokens: 3000,
    outputLanguage: "English",
  });
  const lower = (p: typeof theme.palette) =>
    Object.fromEntries(Object.entries(p).map(([k, v]) => [k, v.toLowerCase()])) as typeof p;
  return {
    name: theme.name.trim(),
    imageStyle: theme.imageStyle.trim(),
    words: theme.words,
    palette: readablePalette(lower(theme.palette)),
    madeFrom: about,
    madeAt: new Date().toISOString(),
  };
}
