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
  /** Share of spoken words that came from the student, 0..1. Only meaningful
   *  when both voices were recorded. */
  studentWordShare?: number;
  generatedAt: string;
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
  audioFile?: string;
  /** Empty means the recording ran start to finish uninterrupted. */
  interruptions: CaptureInterruption[];
  transcript: TranscriptSegment[];
  debrief: DebriefAnswer[];
  debriefAudioFile?: string;
  debriefTranscript: TranscriptSegment[];
  summary?: LessonSummary;
  /** Set once the tutor has accepted this lesson's changes to the student
   *  model. Nothing reaches the student before that. */
  skillsAppliedAt?: string;
};

// ---------------------------------------------------------------------------
// The student model: what accumulates across lessons.
// ---------------------------------------------------------------------------

export type SkillStatus = "struggling" | "improving" | "solid";

export const SKILL_STATUS_LABEL: Record<SkillStatus, string> = {
  struggling: "needs work",
  improving: "coming along",
  solid: "solid",
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
  /** Opaque URL keys - no accounts yet, a link is the credential. */
  studentKey: string;
  parentKey: string;
  skills: Skill[];
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
