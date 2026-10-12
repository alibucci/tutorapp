export type LessonMode = "online" | "classroom";

/**
 * BCP-47 tag handed to the browser's recogniser. Everything downstream is built
 * on the transcript, so getting this wrong quietly ruins the whole lesson.
 */
export const LESSON_LANGUAGES = [
  { tag: "ru-RU", label: "Russian" },
  { tag: "zh-CN", label: "Chinese (Mandarin)" },
  { tag: "en-US", label: "English" },
  { tag: "kk-KZ", label: "Kazakh" },
] as const;

export const DEFAULT_LANGUAGE = "ru-RU";

/** Name of the language, for telling a model which language to write in. */
export function languageName(tag: string): string {
  return LESSON_LANGUAGES.find((l) => l.tag === tag)?.label ?? "Russian";
}

export type Speaker = "tutor" | "student" | "unknown";

/** One utterance captured live. */
export type TranscriptSegment = {
  /** ms since lesson start */
  t: number;
  text: string;
  /** confidence reported by the recognizer, 0..1, when available */
  confidence?: number;
  /** Filled in after the lesson, only when both voices were recorded. */
  speaker?: Speaker;
  /**
   * Which debrief prompt was on screen when this utterance began. Set by the
   * caller rather than derived from `t`, because `t` is when the recogniser
   * handed the text over, which can be most of a minute after it was said.
   */
  tag?: string;
};

/**
 * Who the microphone is allowed to capture.
 * `tutor` is the fallback when there is no consent on file.
 */
export type Capture = "tutor" | "both";

/** Something that could have stopped or corrupted the capture mid-lesson. */
export type CaptureInterruption = {
  at: string;
  kind: "page-hidden" | "track-muted" | "track-ended" | "audio-suspended";
};

export const INTERRUPTION_LABEL: Record<CaptureInterruption["kind"], string> = {
  "page-hidden": "app went to the background",
  "track-muted": "microphone was taken away",
  "track-ended": "microphone stream ended",
  "audio-suspended": "audio was suspended by the system",
};

export type DebriefAnswer = {
  promptId: string;
  text: string;
};

/** What the model pulls out of transcript + debrief. */
export type LessonSummary = {
  covered: string[];
  struggles: { what: string; evidence: string }[];
  improvements: { what: string; evidence: string }[];
  teachingSignals: { correction: string; concept: string }[];
  whatMatters: string;
  nextLesson: string[];
  /** Suggested focus line for the homework, addressed to the child. */
  homeworkFocus?: string;
  generatedAt: string;
  model: string;
};

/**
 * The tutor edits the English; the Chinese is always a translation of it, so
 * the two can never say different things.
 */
export type ParentMessage = {
  en: string;
  zh: string;
  generatedAt: string;
  editedAt?: string;
  /** When the tutor last copied it - the closest we get to "sent". */
  copiedAt?: string;
  model: string;
};

export type Lesson = {
  id: string;
  title: string;
  /** One student per lesson: attribution from tutor-only audio is only
   *  trustworthy one-to-one. */
  studentId: string;
  mode: LessonMode;
  /** Language spoken in the lesson, for the recogniser. */
  language: string;
  /** Fixed when the lesson is created, from the student's consent. */
  capture: Capture;
  createdAt: string;
  startedAt?: string;
  endedAt?: string;
  /** ms of audio actually written (gate-open time in classroom mode) */
  recordedMs?: number;
  /** Empty means the recording ran start to finish uninterrupted. */
  interruptions: CaptureInterruption[];
  transcript: TranscriptSegment[];
  debrief: DebriefAnswer[];
  debriefTranscript: TranscriptSegment[];
  summary?: LessonSummary;
  /** Short note for the parent, sent by the tutor over WeChat. */
  parentMessage?: ParentMessage;
  homework?: Homework;
  /** Set once the tutor has accepted this lesson's changes to the student
   *  model. Nothing reaches the student before that. */
  skillsAppliedAt?: string;
};

// ---------------------------------------------------------------------------
// The student model: what accumulates across lessons.
// ---------------------------------------------------------------------------

export type SkillStatus = "struggling" | "improving" | "solid";

export const SKILL_STATUS_LABEL: Record<SkillStatus, string> = {
  struggling: "Needs work",
  improving: "Coming along",
  solid: "Solid",
};

export type Skill = {
  /** Short topic name, stable enough to match across lessons. */
  topic: string;
  status: SkillStatus;
  /** One line a child can act on, phrased as a goal rather than a verdict. */
  note: string;
  /** Concrete thing to practise. */
  practice?: string;
  firstSeen: string;
  lastSeen: string;
  lessonIds: string[];
};

/** A status change the model proposes after a lesson, pending tutor approval. */
export type SkillChange = {
  topic: string;
  /** Absent when the topic is new. */
  from?: SkillStatus;
  to: SkillStatus;
  note: string;
  practice?: string;
  reason: string;
};

/** Written parental consent to record the child. Without it, capture stays
 *  tutor-only however the lesson is set up. */
export type RecordingConsent = {
  grantedAt: string;
  /** Who gave it, as the tutor recorded it. */
  grantedBy: string;
};

export type Tutor = {
  id: string;
  /** Login. Created by the superadmin - nobody signs themselves up. */
  email: string;
  name: string;
  passwordHash: string;
  /** Set until the tutor picks their own password. */
  mustChangePassword: boolean;
  /**
   * Bumped whenever every existing session should stop working: a suspension,
   * an admin password reset, or the tutor changing their own password. Sessions
   * carry the value they were issued with, so an old cookie stops matching.
   */
  tokenVersion: number;
  active: boolean;
  createdAt: string;
};

export type Student = {
  id: string;
  /** The tutor who owns this student. */
  tutorId: string;
  name: string;
  createdAt: string;
  recordingConsent?: RecordingConsent;
  /** Opaque URL keys - a link is one way in, an account the other. */
  studentKey: string;
  parentKey: string;
  /** One sign-in the child and the parent share, made by the tutor. */
  login?: FamilyLogin;
  /** Id from GAME_STYLES - what the child's homework looks like. */
  gameStyle?: string;
  skills: Skill[];
};

/**
 * A username and password the tutor creates and hands to the family. One per
 * student, shared by the child and the parent - a family uses one phone and
 * one WeChat, and two passwords would just mean one forgotten. Children have
 * no email, so it is a username; the tutor resets it when it is forgotten.
 */
export type FamilyLogin = {
  username: string;
  passwordHash: string;
  /** Bumped on reset or removal, which signs out every device. */
  tokenVersion: number;
  createdAt: string;
};

// ---------------------------------------------------------------------------
// Homework: a picture the tutor picks, and the same tasks every time.
// ---------------------------------------------------------------------------

export const HOMEWORK_TASKS = [
  {
    id: "describe",
    prompt: "Describe the picture. What do you see here?",
    hint: "Say or write at least three sentences.",
  },
  {
    id: "next",
    prompt: "What do you think will happen next?",
    hint: "Tell the story forward.",
  },
] as const;

export const ADJECTIVES_TASK =
  "Give me 3 adjectives that describe this situation the best.";

export type HomeworkAnswers = {
  describe: string;
  next: string;
  adjectives: [string, string, string];
  submittedAt: string;
};

// ---------------------------------------------------------------------------
// Practice games: the drill half of homework, built from this lesson's
// mistakes. Three mechanics, each a different way to handle the same words.
// ---------------------------------------------------------------------------

/** Pick the word that belongs in the gap. */
export type ChooseRound = {
  /** The sentence, with "___" where the answer goes. */
  sentence: string;
  options: string[];
  /** Index into `options`. */
  answer: number;
  /** One short line shown after the tap, in words a child knows. */
  why: string;
};

/** Put the words in order to make the sentence. */
export type BuildRound = {
  /** The words in the right order; the game shuffles them. */
  answer: string[];
  /** What the sentence means, or when to use it. */
  why: string;
};

/** Let the right words through and turn the wrong ones away. */
export type CatchRound = {
  word: string;
  /** Whether this word follows the rule the game states. */
  keep: boolean;
};

export type Exercise =
  | { kind: "choose"; title: string; topic: string; rounds: ChooseRound[] }
  | { kind: "build"; title: string; topic: string; rounds: BuildRound[] }
  | {
      kind: "catch";
      title: string;
      topic: string;
      /** What the child is collecting, e.g. "past tense words". */
      rule: string;
      rounds: CatchRound[];
    };

export type ExerciseKind = Exercise["kind"];

export const EXERCISE_LABEL: Record<ExerciseKind, string> = {
  choose: "Pick the right word",
  build: "Build the sentence",
  catch: "Keep the right words",
};

/** How one game went. Written when the child finishes it. */
export type ExerciseResult = {
  kind: ExerciseKind;
  topic: string;
  right: number;
  total: number;
  finishedAt: string;
};

export type Homework = {
  /** Stored picture, uploaded by the tutor. */
  imageFile?: string;
  /** One line for the child on what to practise while answering. */
  focus: string;
  /** Pictures drawn for this lesson, waiting for the tutor to pick one. */
  candidates?: string[];
  /** The scene they were drawn from, kept so a redraw can vary it. */
  scene?: string;
  /** Games built from this lesson's mistakes, for the tutor to check. */
  exercises?: Exercise[];
  /** The child sees nothing until the tutor sends it. */
  sentAt?: string;
  answers?: HomeworkAnswers;
  /** One entry per game the child finished. */
  results?: ExerciseResult[];
};

// ---------------------------------------------------------------------------
// Weekly parent report.
// ---------------------------------------------------------------------------

export type ParentReportBody = {
  /** What moved this week - the question a parent is actually asking. */
  trajectory: string;
  /** Stable things the child is good at, not this week's wins. */
  strengths: string[];
  wins: string[];
  working: string[];
  atHome: string[];
};

export type ParentReport = {
  id: string;
  studentId: string;
  /** ISO dates, Monday to Sunday. */
  weekStart: string;
  weekEnd: string;
  lessonIds: string[];
  body: ParentReportBody;
  generatedAt: string;
  model: string;
  /** Nothing is visible to a parent until the tutor approves it. */
  approvedAt?: string;
  editedByTutor: boolean;
};

export const DEBRIEF_PROMPTS = [
  { id: "covered", label: "What did you cover?", seconds: 12 },
  { id: "struggled", label: "What did they struggle with?", seconds: 15 },
  { id: "improved", label: "What improved, and how could you tell?", seconds: 12 },
  { id: "matters", label: "What matters most here?", seconds: 11 },
  { id: "next", label: "What should happen next lesson?", seconds: 10 },
] as const;

export const DEBRIEF_TOTAL_SECONDS = DEBRIEF_PROMPTS.reduce(
  (n, p) => n + p.seconds,
  0,
);
