import type {
  EnglishLevel,
  EnglishKind,
  LearningDifficulty,
  LearningGoal,
  LearningPrefs,
  Student,
  StudentProfile,
} from "./types";

/**
 * Who a learner is, and what follows from it: how the homework looks, which
 * kinds of task it holds and how long it runs. The tutor describes the learner
 * once; everything else is worked out here, so it can change whenever the
 * description does.
 *
 * Pure: the browser shows the tutor what a profile will lead to.
 */

export const LEVELS: { id: EnglishLevel; label: string }[] = [
  { id: "beginner", label: "Beginner (A1)" },
  { id: "elementary", label: "Elementary (A2)" },
  { id: "intermediate", label: "Intermediate (B1)" },
  { id: "upper", label: "Upper-intermediate (B2)" },
  { id: "advanced", label: "Advanced (C1+)" },
];

export const GOALS: { id: LearningGoal; label: string }[] = [
  { id: "school", label: "School English" },
  { id: "speaking", label: "Speaking" },
  { id: "accent", label: "Accent" },
  { id: "other", label: "Something else" },
];

/** From here on the homework drops the game: no points, no quests. */
export const PLAIN_FROM_AGE = 14;
/** From here on there is no parent to write to. */
export const ADULT_AGE = 18;

export const ABOUT_MAX = 400;
export const PARENT_WISH_MAX = 200;

export function lookFor(profile: StudentProfile | undefined): "game" | "plain" {
  if (profile?.look) return profile.look;
  return (profile?.age ?? 0) >= PLAIN_FROM_AGE ? "plain" : "game";
}

/** A grown-up learner has nobody to send a parent's message to. */
export function hasParent(student: Pick<Student, "profile">): boolean {
  return (student.profile?.age ?? 0) < ADULT_AGE;
}

/**
 * Which kinds of task fit the goal. School English keeps the three games a
 * child already knows; the spoken goals swap them for talking.
 */
export function formatsFor(profile: StudentProfile | undefined): EnglishKind[] {
  const all: Record<LearningGoal, EnglishKind[]> = {
    school: ["choose", "build", "catch"],
    speaking: ["dialogue", "speak", "words"],
    accent: ["repeat", "dialogue", "speak"],
    other: ["choose", "words", "speak"],
  };
  const formats = all[profile?.goal ?? "school"];
  // Short bursts: two things, not three.
  return profile?.shortTasks ? formats.slice(0, 2) : formats;
}

/** The profile as the tutor typed it, checked. Null when it does not fit. */
export function readProfile(input: unknown): StudentProfile | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const raw = input as Record<string, unknown>;
  const profile: StudentProfile = {};
  if (raw.age !== undefined && raw.age !== null && raw.age !== "") {
    const age = Number(raw.age);
    if (!Number.isInteger(age) || age < 3 || age > 99) return null;
    profile.age = age;
  }
  if (raw.level !== undefined && raw.level !== "") {
    if (!LEVELS.some((l) => l.id === raw.level)) return null;
    profile.level = raw.level as EnglishLevel;
  }
  if (raw.goal !== undefined && raw.goal !== "") {
    if (!GOALS.some((g) => g.id === raw.goal)) return null;
    profile.goal = raw.goal as LearningGoal;
  }
  if (typeof raw.about === "string" && raw.about.trim()) {
    profile.about = raw.about.trim().slice(0, ABOUT_MAX);
  }
  if (raw.shortTasks === true) profile.shortTasks = true;
  if (raw.look === "game" || raw.look === "plain") profile.look = raw.look;
  if (typeof raw.parentWish === "string" && raw.parentWish.trim()) {
    profile.parentWish = raw.parentWish.trim().slice(0, PARENT_WISH_MAX);
  }
  return profile;
}

/** The learner, in a few lines for a model to write for. */
export function describeLearner(name: string, profile: StudentProfile | undefined): string {
  const p = profile ?? {};
  const level = LEVELS.find((l) => l.id === p.level)?.label;
  const goal = GOALS.find((g) => g.id === p.goal)?.label;
  return [
    `Learner: ${name}`,
    p.age ? `Age: ${p.age}` : "Age: not given (assume a child of about 9)",
    level ? `English level: ${level}` : "",
    goal ? `Goal: ${goal}` : "",
    p.about ? `The tutor about them: ${p.about}` : "",
    p.shortTasks ? "Keep everything short: few rounds, short sentences." : "",
  ]
    .filter(Boolean)
    .join("\n");
}

// ---------------------------------------------------------------------------
// The learning programme: what the family wants taught, set once
// ---------------------------------------------------------------------------

export const DIFFICULTIES: { id: LearningDifficulty; label: string }[] = [
  { id: "easier", label: "A step easier than their level" },
  { id: "level", label: "At their level" },
  { id: "stretch", label: "A step above their level (a stretch)" },
];

/** Long enough for a sentence or two each; the prompt stays short. */
export const LEARNING_MAX = {
  objectives: 300,
  curriculum: 200,
  include: 300,
  avoid: 300,
  requirements: 400,
} as const;

type LearningText = keyof typeof LEARNING_MAX;
const LEARNING_TEXTS = Object.keys(LEARNING_MAX) as LearningText[];

/**
 * The programme as it is stored: trimmed, empty fields and the defaults left
 * out, so an untouched form stores nothing at all. Undefined when empty.
 */
export function cleanLearning(prefs: LearningPrefs | undefined): LearningPrefs | undefined {
  if (!prefs) return undefined;
  const out: LearningPrefs = {};
  for (const key of LEARNING_TEXTS) {
    const text = prefs[key]?.trim().replace(/\s+/g, " ");
    if (text) out[key] = text.slice(0, LEARNING_MAX[key]);
  }
  if (prefs.difficulty === "easier" || prefs.difficulty === "stretch") out.difficulty = prefs.difficulty;
  if (prefs.approval === true) out.approval = true;
  return Object.keys(out).length ? out : undefined;
}

const DIFFICULTY_LINE: Record<Exclude<LearningDifficulty, "level">, string> = {
  easier: "one step easier than their level - never more than one step",
  stretch: "one step above their level, as a stretch - never more than one step",
};

/**
 * The programme as lines for a model, without a heading: a group's plan puts
 * several children's lines together (lessonPlan.ts describeLearners). The
 * parent's wish is one of them - until this it reached only the message to
 * the parent. Whether the tutor approves practice first is not the model's
 * business, so it is left out.
 */
export function preferenceLines(profile: StudentProfile | undefined): string[] {
  const p = profile?.learning ?? {};
  const difficulty = p.difficulty && p.difficulty !== "level" ? DIFFICULTY_LINE[p.difficulty] : "";
  const wish = profile?.parentWish?.trim();
  return [
    p.objectives?.trim() ? `- Objectives: ${p.objectives.trim()}` : "",
    p.curriculum?.trim() ? `- Curriculum focus: ${p.curriculum.trim()}` : "",
    p.include?.trim() ? `- Topics to include: ${p.include.trim()}` : "",
    p.avoid?.trim() ? `- Topics to AVOID (a hard limit): ${p.avoid.trim()}` : "",
    p.requirements?.trim() ? `- Content requirements: ${p.requirements.trim()}` : "",
    difficulty ? `- Difficulty: ${difficulty}` : "",
    wish ? `- The parents asked for: ${wish}` : "",
  ].filter(Boolean);
}

/**
 * The learner's programme as a short block for any prompt that writes
 * learning content. Empty when nothing is set, so a learner without one gets
 * exactly the prompt they always had. Smart Review and anything else that
 * writes content for a learner calls this too.
 */
export function describePreferences(profile: StudentProfile | undefined): string {
  const lines = preferenceLines(profile);
  return lines.length ? `The learning programme the family and tutor chose:\n${lines.join("\n")}` : "";
}

/**
 * How a model is to read that block. Added to the system prompt only when
 * there is a block to read.
 */
export const PREFERENCE_RULES = `THE LEARNING PROGRAMME (given with the learner):
- Topics to avoid are hard limits. Never use them anywhere: not in a sentence,
  an option, an example, a name or a picture idea.
- The curriculum focus and the topics to include guide what the content is
  about; the content requirements say what it may be built from. Where they
  cannot both be met, the requirements win.
- Difficulty moves the level by one step at most, easier or harder.
- The game theme - the hero, the adventure, the look - is decoration only. It
  never replaces the learning content and never decides what is taught.
- What the lesson needs and the tutor asks for here comes first. The
  programme and what the parents asked for are worked in where they fit -
  except topics to avoid, which always hold.`;

/** Who the homework talks to: a child, or someone who is not one. */
export function isChild(profile: StudentProfile | undefined): boolean {
  return lookFor(profile) === "game";
}
