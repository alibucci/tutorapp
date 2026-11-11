export type LessonMode = "online" | "classroom";

/**
 * BCP-47 tag handed to the browser's recogniser. Everything downstream is built
 * on the transcript, so getting this wrong quietly ruins the whole lesson.
 */
export const LESSON_LANGUAGES = [
  { tag: "en-US", label: "English" },
  { tag: "zh-CN", label: "Chinese (Mandarin)" },
] as const;

export const DEFAULT_LANGUAGE = "en-US";

/** Name of the language, for telling a model which language to write in. */
export function languageName(tag: string): string {
  return LESSON_LANGUAGES.find((l) => l.tag === tag)?.label ?? "English";
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
   * Group lessons only: who said this line - "tutor", a student's id, or
   * "unknown". Suggested from the names the tutor calls, checked by the tutor.
   */
  who?: string;
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
   *  trustworthy one-to-one. Several children are a "group" lesson, split into
   *  one of these for each of them after the tutor checks who said what. */
  studentId: string;
  mode: LessonMode;
  /** Language spoken in the lesson, for the recogniser. */
  language: string;
  /** Fixed when the lesson is created, from the student's consent. */
  capture: Capture;
  /**
   * "intro" is a spoken note about a child nobody has taught yet: no
   *  recording, different questions, and the summary knows it is not a lesson.
   *
   * "group" is a lesson with several children. It holds the shared recording
   * and debrief, only the tutor ever sees it, and it is split into one ordinary
   * lesson per child - so a child's page, homework and parents' notes work as
   * they always have, and nobody sees another child's answers.
   */
  kind?: "intro" | "group";
  /** The children in a group lesson. `studentId` is the first of them. */
  groupStudentIds?: string[];
  /** On a group lesson, once split: the lesson made for each child. */
  groupLessonIds?: string[];
  /** On a child's lesson: the group lesson it was split from. */
  groupId?: string;
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
  /** Where to send notices, once this tutor has connected Telegram. */
  telegram?: { chatId: string; name: string; linkedAt: string };
  /** A connection in progress: the code the tutor is about to send the bot. */
  telegramLink?: { code: string; expiresAt: string };
};

export type Student = {
  id: string;
  /** The tutor who owns this student. */
  tutorId: string;
  name: string;
  createdAt: string;
  recordingConsent?: RecordingConsent;
  /**
   * The learner's own yes to having their pronunciation scored. Only an adult
   * can give it, only from their own homework screen - never the tutor.
   */
  voiceConsent?: VoiceConsent;
  /** Opaque URL keys - a link is one way in, an account the other. */
  studentKey: string;
  parentKey: string;
  /** One sign-in the child and the parent share, made by the tutor. */
  login?: FamilyLogin;
  /** Id from GAME_STYLES - what the child's homework looks like. */
  gameStyle?: string;
  skills: Skill[];
  /**
   * Set when the tutor archives the child. Off the tutor's list, and every
   * way in for the family stops working - links, sign-in, open sessions - but
   * the lessons and homework are kept, and restoring brings it all back.
   */
  archivedAt?: string;
  /** Sums in the child's theme, apart from any lesson. Off until the tutor says. */
  math?: MathPractice;
  /** Who this learner is, so the homework can fit them. See profile.ts. */
  profile?: StudentProfile;
  /**
   * A theme made for this learner from what the tutor wrote about them. Used
   * when `gameStyle` is "custom". Same shape as a ready-made theme.
   */
  customStyle?: CustomStyle;
};

export type EnglishLevel = "beginner" | "elementary" | "intermediate" | "upper" | "advanced";
export type LearningGoal = "school" | "speaking" | "accent" | "other";

/**
 * What the tutor says about a learner. Nothing about health: a child who needs
 * short bursts gets `shortTasks`, never a diagnosis written down.
 */
export type StudentProfile = {
  age?: number;
  level?: EnglishLevel;
  goal?: LearningGoal;
  /** In the tutor's words: "a couple, 25, own a restaurant in Shanghai". */
  about?: string;
  /** Fewer, shorter tasks, and a change of activity more often. */
  shortTasks?: boolean;
  /** Overrides the look the age would pick. */
  look?: "game" | "plain";
};

export type CustomStyle = {
  name: string;
  imageStyle: string;
  words: {
    start: string;
    step: string;
    done: string;
    reward: string;
    submit: string;
    cheer: string;
    heading?: string;
  };
  palette: {
    ground: string;
    panel: string;
    ink: string;
    accent: string;
    accentInk: string;
  };
  /** The description it was made from, so an unchanged one is not paid for twice. */
  madeFrom: string;
  madeAt: string;
};

export type MathPractice = {
  on: boolean;
  /** Which level the next game is drawn from. See MATH_LEVELS. */
  level: number;
  games: MathGame[];
};

/** One finished game, marked by the server. */
export type MathGame = {
  at: string;
  /** The level it was played at, which may not be the child's level now. */
  level: number;
  right: number;
  total: number;
  /** The sums missed on the first go, such as "8 + 5". */
  wrong: string[];
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

/** Hear a sentence, then say it back. */
export type RepeatRound = {
  sentence: string;
  /** One short line on how to say it, shown after the answer. */
  tip: string;
};

/** One exchange: the other person speaks, then the learner says their line. */
export type DialogueRound = {
  them: string;
  you: string;
};

/** A question to answer out loud, in the learner's own words. */
export type SpeakRound = {
  question: string;
  /** What a good answer could sound like, shown after the answer. */
  example: string;
};

/** Which word fits a meaning: the vocabulary of the learner's topic. */
export type WordsRound = {
  meaning: string;
  options: string[];
  answer: number;
  why: string;
};

export type Exercise =
  | { kind: "choose"; title: string; topic: string; rounds: ChooseRound[] }
  | { kind: "repeat"; title: string; topic: string; rounds: RepeatRound[] }
  | {
      kind: "dialogue";
      title: string;
      topic: string;
      /** Where this happens and who the other person is. */
      setting: string;
      rounds: DialogueRound[];
    }
  | { kind: "speak"; title: string; topic: string; rounds: SpeakRound[] }
  | { kind: "words"; title: string; topic: string; rounds: WordsRound[] }
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
  repeat: "Listen and repeat",
  dialogue: "Role-play",
  speak: "Answer out loud",
  words: "Topic words",
};

export const EXERCISE_KINDS = Object.keys(EXERCISE_LABEL) as ExerciseKind[];

/**
 * What the child sent back for one round: the option they picked, the words
 * they put in order, or whether they kept the word. The server turns this
 * into a verdict - it holds the exercise, the browser only holds a copy.
 */
export type RoundReply = number | string[] | boolean | string;

/** One round, as the tutor reads it back. */
export type RoundAnswer = {
  /** What was asked, short enough to scan in a list. */
  asked: string;
  /** What the child answered. */
  answered: string;
  right: boolean;
};

/** How one game went. Written when the child finishes it. */
export type ExerciseResult = {
  kind: ExerciseKind;
  topic: string;
  right: number;
  total: number;
  finishedAt: string;
  /** Every round, so the tutor sees where it went wrong, not just how often. */
  rounds?: RoundAnswer[];
  /** How many times it has been played. 1, or absent, means once. */
  attempts?: number;
  /**
   * The score the first time, which never changes.
   *
   * A replay overwrites `right`, and without this a child who played again
   * from memory would quietly erase the only honest measure of what they knew
   * - which is exactly what the parent's progress is built from.
   */
  firstRight?: number;
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
  /**
   * Pronunciation scores, by "kind.round", from the first try at each line.
   * Scores only: the recording itself is never kept.
   */
  voice?: Record<string, Pronounced>;
  /**
   * The look it was sent in. Changing the learner's profile later changes the
   * next homework, not one already given out.
   */
  style?: SentStyle;
};

/** A theme as it was when a homework went out: enough to draw it again. */
export type SentStyle = Omit<CustomStyle, "madeFrom" | "madeAt"> & {
  id: string;
  plain?: boolean;
  skin?: "minecraft";
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
  { id: "covered", label: "What did you cover?" },
  { id: "struggled", label: "What did they struggle with?" },
  { id: "improved", label: "What improved, and how could you tell?" },
  { id: "matters", label: "What matters most here?" },
  { id: "next", label: "What should happen next lesson?" },
] as const;

/**
 * The five questions for a child you have not taught yet.
 *
 * "What did you cover?" is meaningless before the first lesson, but everything
 * downstream - topics, games, the note home - is built from a debrief, so a
 * new child gets the same machine with the questions changed.
 */
export const INTRO_PROMPTS = [
  { id: "level", label: "Where are they now, roughly?" },
  { id: "hard", label: "What do they find hard?" },
  { id: "likes", label: "What are they into?" },
  { id: "goal", label: "What do they need to get to?" },
  { id: "start", label: "Where will you start?" },
] as const;

/**
 * The questions after a group lesson: three about each child, none shared. An
 * answer belongs to one child from the moment it is given, so what is said about
 * one cannot reach another's summary or parents. Ids must fit a transcript tag
 * (40 characters).
 */
export function groupPrompts(students: { id: string; name: string }[]) {
  return students.flatMap((s) => {
    const ids = childPromptIds(s.id);
    return [
      { id: ids.worked, label: `What did ${s.name} work on?`, child: s.id, childName: s.name },
      { id: ids.hard, label: `What was hard for ${s.name}?`, child: s.id, childName: s.name },
      { id: ids.next, label: `What should ${s.name} do next?`, child: s.id, childName: s.name },
    ];
  });
}

export function childPromptIds(studentId: string) {
  return { worked: `w:${studentId}`, hard: `h:${studentId}`, next: `n:${studentId}` };
}

/** Every prompt the app asks, whichever set it came from. */
export function promptLabel(id: string): string {
  const all = [...DEBRIEF_PROMPTS, ...INTRO_PROMPTS] as { id: string; label: string }[];
  return all.find((p) => p.id === id)?.label ?? id;
}

// ---------------------------------------------------------------------------
// Pronunciation scoring.
// ---------------------------------------------------------------------------

/** What the learner agreed to, and which wording they saw. */
export type VoiceConsent = { at: string; version: number };

/** One line said aloud, as the scoring service heard it. 0-100 throughout. */
export type Pronounced = {
  overall: number;
  /** How clearly each sound was made. */
  pronunciation: number;
  /** Pace and pauses. */
  fluency: number;
  /** Stress and rhythm. */
  rhythm: number;
  /** How much of the line was said at all. */
  complete: number;
  words: PronouncedWord[];
  at: string;
};

export type PronouncedWord = {
  word: string;
  score: number;
  /** Not heard at all. */
  missed?: boolean;
  /** The sounds that went wrong, with what was heard instead when known. */
  sounds?: { sound: string; heard?: string }[];
};
