import type {
  EnglishLevel,
  ExerciseKind,
  LearningGoal,
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
export function formatsFor(profile: StudentProfile | undefined): ExerciseKind[] {
  const all: Record<LearningGoal, ExerciseKind[]> = {
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

/** Who the homework talks to: a child, or someone who is not one. */
export function isChild(profile: StudentProfile | undefined): boolean {
  return lookFor(profile) === "game";
}
