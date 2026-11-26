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
  /**
   * The child's own words, word for word from the transcript, when the
   * message carries a line quoting them (see parentLines.ts). Cleared when the
   * tutor deletes that line from the English.
   */
  quote?: string;
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
   *
   * "practice" is extra homework the tutor asked for - see `request`.
   */
  kind?: "intro" | "group" | "practice";
  /**
   * On "practice": homework from a programme (see src/content), not from
   * the tutor's words. Which story it is was picked by the system.
   */
  module?: LessonModule;
  /**
   * On "practice": extra homework with no lesson behind it, built from what
   * the tutor asked for in their own words.
   */
  request?: string;
  /**
   * On "practice": a Smart Review - practice built from the learner's memory
   * (memory.ts), not from one lesson. Absent on every other homework.
   */
  review?: SmartReview;
  /** The children in a group lesson. `studentId` is the first of them. */
  groupStudentIds?: string[];
  /** On a group lesson, once split: the lesson made for each child. */
  groupLessonIds?: string[];
  /** On a child's lesson: the group lesson it was split from. */
  groupId?: string;
  /** Taught from this card of a lesson plan; `storyId` when it is a Bible story. */
  planCard?: { planId: string; cardId: string; storyId?: string };
  /** What of the plan the lesson reached, read from the recording and debrief. */
  planCheck?: PlanCheck;
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
  /**
   * The automatic summary - games - send did not get through. Cleared when it
   * does; the tutor's home screen shows it as something to retry.
   */
  autoFailed?: { at: string; error: string };
  /** Set once the tutor has accepted this lesson's changes to the student
   *  model. Nothing reaches the student before that. */
  skillsAppliedAt?: string;
};

/** Why and how a Smart Review was made, and what became of it. */
export type SmartReview = {
  /** Why, for the tutor: which skills, and what in the evidence chose them. */
  reason: string;
  /** The skills it practises. */
  skillIds: string[];
  /** How long it is meant to take. */
  minutes: number;
  /** The tutor pressed "Generate", or the learning schedule made it. */
  by: "tutor" | "schedule";
  /** The schedule's slot it belongs to ("2026-11-26"), so a slot is never filled twice. */
  slot?: string;
  /** What the tutor asked for when making it. */
  comment?: string;
  /** The newest evidence it was built on: newer results mean the draft may be out of date. */
  builtOn?: string;
  /** Set by the tutor or the queue; otherwise its state follows the homework. */
  state?: "deferred" | "skipped" | "archived";
  stateAt?: string;
  stateReason?: string;
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

/**
 * What kind of thing a skill is. A lesson's topic ("Animals at the zoo") is
 * not a skill; "naming animals" is vocabulary, "it can + verb" is grammar.
 */
export const SKILL_AREAS = ["grammar", "vocabulary", "speaking", "comprehension", "pronunciation", "curriculum", "other"] as const;
export type SkillArea = (typeof SKILL_AREAS)[number];

export const SKILL_AREA_LABEL: Record<SkillArea, string> = {
  grammar: "Grammar",
  vocabulary: "Vocabulary",
  speaking: "Speaking",
  comprehension: "Understanding",
  pronunciation: "Pronunciation",
  curriculum: "Programme",
  other: "Other",
};

/** One piece of evidence about a skill: a lesson, or a homework game. */
export type SkillEvidence = {
  at: string;
  source: "lesson" | "homework" | "review";
  lessonId: string;
  /** Homework: first-attempt rounds right out of rounds marked. */
  right?: number;
  total?: number;
  /** Lesson: the status the tutor accepted, with its reason. */
  status?: SkillStatus;
  note?: string;
};

/** A concrete thing the child got wrong, kept so practice can return to it. */
export type SkillMistake = {
  at: string;
  lessonId: string;
  asked: string;
  answered: string;
  correct?: string;
};

/**
 * Where a skill stands for practice, worked out from its status and its
 * evidence - never typed in, and never a made-up percentage.
 */
export type MemoryState = "not_assessed" | "learning" | "needs_review" | "improving" | "retained";

export const MEMORY_STATE_LABEL: Record<MemoryState, string> = {
  not_assessed: "Not assessed",
  learning: "Learning",
  needs_review: "Needs review",
  improving: "Improving",
  retained: "Retained",
};

export type Skill = {
  /**
   * Stable id: the skill keeps it when the tutor renames or merges it. Older
   * records have none and are given one when next read (see memory.ts).
   */
  id?: string;
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
  area?: SkillArea;
  /** The broader skill this is part of: "Past Simple" for "irregular verbs". */
  parent?: string;
  /** Names it was known by before a merge, so history and matching keep working. */
  aliases?: string[];
  /** Newest last, capped (memory.ts). */
  evidence?: SkillEvidence[];
  /** Newest last, capped. */
  mistakes?: SkillMistake[];
  /** Last time homework or a review practised it. */
  lastPracticed?: string;
  /** When it is due to come back in practice (spaced repetition). */
  reviewAt?: string;
  /** Spaced-repetition step: how far apart the reviews have grown. */
  step?: number;
};

/** A status change the model proposes after a lesson, pending tutor approval. */
export type SkillChange = {
  /** The existing skill this is, when the model matched one (memory.ts ids). */
  skillId?: string;
  topic: string;
  area?: SkillArea;
  /** The broader skill it belongs to, when there is one. */
  parent?: string;
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
  /**
   * Where homework notices go by email. Not the login: a login is often made
   * up and no mailbox. Mail goes only once the tutor has opened the link sent
   * to this address.
   */
  noticeEmail?: {
    address: string;
    confirmedAt?: string;
    /** The confirmation link's secret, until it is used. */
    token?: string;
    sentAt?: string;
  };
  /** Pictures drawn for lesson plans this month: a paid service, so capped. */
  planImages?: { month: string; count: number };
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
  /** Who this learner is, so the homework can fit them. See profile.ts. */
  profile?: StudentProfile;
  /**
   * A theme made for this learner from what the tutor wrote about them. Used
   * when `gameStyle` is "custom". Same shape as a ready-made theme.
   */
  customStyle?: CustomStyle;
  /**
   * Programmes outside English, switched on one by one. Absent means off, so
   * a record from before this field needs nothing done to it.
   */
  modules?: { christianity?: ModuleState };
  /**
   * Homework mistakes the tutor asked to see again ("Practise these next
   * time"). The next homework built for this learner works them in; see
   * redo.ts.
   */
  redo?: RedoItem[];
};

/** One round the learner got wrong, kept for the next homework. */
export type RedoItem = {
  /** The lesson whose homework it came from. */
  fromLesson: string;
  kind: ExerciseKind;
  topic: string;
  /** What was asked, as the tutor read it in the answers. */
  asked: string;
  /** What the learner answered. */
  answered: string;
  /** The right answer, where the game has one. */
  correct?: string;
  savedAt: string;
  /**
   * The homework it went into. Kept while that homework can still be built
   * again, and dropped once a later one is built.
   */
  usedIn?: string;
};

/**
 * Where a learner is in a programme. Kept when the module is switched off,
 * so switching it on again carries on from the same story.
 */
export type ModuleState = {
  enabled: boolean;
  /** When the tutor ticked "the parent asked for this". Required to switch on. */
  parentAskedAt: string;
  /** Index of the next story in the programme. */
  position: number;
  /** Story ids the learner has passed. */
  passed: string[];
  /** A story not passed: the next homework starts with a short recap of it. */
  review?: string;
  /**
   * The next story could not be built and sent by itself. Cleared when one
   * goes out; the tutor's home screen shows it as something to retry.
   */
  failed?: { at: string; error: string };
};

/** What a programme homework is, fixed when it is built. */
export type LessonModule = {
  id: "christianity";
  storyId: string;
  /** The story recapped at the start, when the last one was not passed. */
  reviewOf?: string;
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
  /**
   * What the parent asked for, in the tutor's words: "wants more speaking".
   * Read by the message to the parent and, as one line of the learning
   * programme (describePreferences in profile.ts), by everything that writes
   * lessons and homework. Neither the parent nor the child is shown it.
   */
  parentWish?: string;
  /**
   * What the learning programme is for and about, set once so the tutor never
   * repeats the parents' wishes at each generation. Absent on older records,
   * which need nothing done to them. Kept apart from the game theme
   * (`Student.gameStyle`, `look`): that is how homework looks, this is what
   * it teaches.
   */
  learning?: LearningPrefs;
};

/** How far from the learner's level the content may move: one step at most. */
export type LearningDifficulty = "easier" | "level" | "stretch";

/** Every field optional: an empty programme is simply not mentioned to the model. */
export type LearningPrefs = {
  /** "Conversational English, vocabulary, grammar and sentence building". */
  objectives?: string;
  /** What the content is about, e.g. "Bible stories" - whatever the game theme. */
  curriculum?: string;
  /** Topics to work in. */
  include?: string;
  /** Topics never to use: a hard limit. */
  avoid?: string;
  /** "Homework uses only material covered in lessons". */
  requirements?: string;
  /** Absent means "level". */
  difficulty?: LearningDifficulty;
  /**
   * Practice the app makes by itself waits for the tutor's OK before it is
   * sent. Only stored here; the schedule that sends such practice reads it.
   */
  approval?: boolean;
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

/** A question about a story the learner has just read. */
export type QuestionRound = {
  question: string;
  options: string[];
  answer: number;
  why: string;
};

/** Things from a story to put back in the order they happened. */
export type OrderRound = {
  /** In the right order; the game shuffles them. */
  events: string[];
  why: string;
};

/**
 * "What would you do?" Every option is a kind one; one is the kindest. There
 * is nothing to lose here, only something to notice.
 */
export type KindRound = {
  situation: string;
  options: string[];
  best: number;
  why: string;
};

type ExerciseBody =
  | { kind: "choose"; title: string; topic: string; rounds: ChooseRound[] }
  | { kind: "questions"; title: string; topic: string; rounds: QuestionRound[] }
  | { kind: "recall"; title: string; topic: string; rounds: QuestionRound[] }
  | { kind: "order"; title: string; topic: string; rounds: OrderRound[] }
  | { kind: "kindness"; title: string; topic: string; rounds: KindRound[] }
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

/**
 * One game. `skillIds` are the learner's skills it practises (memory.ts), so
 * its result is counted toward them; absent on games made before that.
 */
export type Exercise = ExerciseBody & { skillIds?: string[] };

export type ExerciseKind = Exercise["kind"];

export const EXERCISE_LABEL: Record<ExerciseKind, string> = {
  choose: "Pick the right word",
  build: "Build the sentence",
  catch: "Keep the right words",
  repeat: "Listen and repeat",
  dialogue: "Role-play",
  speak: "Answer out loud",
  words: "Topic words",
  questions: "About the story",
  recall: "Remember the last story",
  order: "What came first?",
  kindness: "What would you do?",
};

/**
 * The kinds an English homework is built from. Closed on purpose: the planner
 * for extra homework picks from these, and the story kinds below only make
 * sense after a text to read.
 */
export const EXERCISE_KINDS = ["choose", "build", "catch", "repeat", "dialogue", "speak", "words"] as const;
export type EnglishKind = (typeof EXERCISE_KINDS)[number];

/** Tasks about a text read first ("Read and answer"). */
export const STORY_KINDS = ["questions", "recall", "order", "kindness"] as const;

/** Every kind the server will mark. */
export const ALL_EXERCISE_KINDS = [...EXERCISE_KINDS, ...STORY_KINDS] as ExerciseKind[];

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
  /**
   * Not marked at all: nothing was said, or nothing could be heard (a
   * microphone or recogniser failure). Never counted as wrong - a skipped
   * question is not proof the child does not know it.
   */
  skipped?: boolean;
  /**
   * "What would you do?" only: whether the child picked the kindest of the
   * kind options. Shown to the tutor, never scored (`right` is always true).
   */
  kindest?: boolean;
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
  /** How many rounds were marked that first time (see `skipped`). */
  firstTotal?: number;
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
  /** When it went to the child - by itself, once built, or by the tutor. */
  sentAt?: string;
  /**
   * The tutor took it back. From then on it is theirs to send: the server
   * never sends it again by itself.
   */
  takenBackAt?: string;
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
  /**
   * "Read and answer": a text with pictures, read (and listened to) before the
   * games, which then ask about it. Not tied to any one subject.
   */
  read?: ReadAndAnswer;
  /** How many earlier mistakes these games were asked to bring back. */
  redo?: number;
  /** When the tutor asked for this homework's mistakes to come back (redo.ts). */
  carriedAt?: string;
};

export type ReadAndAnswer = {
  pages: ReadPage[];
  /** One line on the last screen: "Today: we say thank you." */
  closing?: string;
  /** Words the learner meets for the first time, for the tutor. */
  newWords?: string[];
  /** What was checked by code before the tutor saw it, for the tutor. */
  checks?: string[];
};

export type ReadPage = {
  heading?: string;
  paragraphs: string[];
  /** Ready-made pictures, served as static files. */
  pictures: { src: string; alt: string }[];
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

/**
 * A saved group: a name and the children in it, picked in one tap when a
 * lesson or a plan starts. Nothing else - no profile, no history of its own;
 * each child keeps theirs.
 */
export type StudentGroup = {
  id: string;
  tutorId: string;
  /** "Tuesday, little ones". */
  name: string;
  /** 2 to 6 of this tutor's children, the same limit as a group lesson. */
  studentIds: string[];
  createdAt: string;
  archivedAt?: string;
};

// ---------------------------------------------------------------------------
// Lesson plans and their materials
// ---------------------------------------------------------------------------

/** The five parts every lesson is built from, in this order. */
export const SLIDE_PARTS = ["warmup", "words", "activity", "speaking", "wrapup"] as const;
export type SlidePart = (typeof SLIDE_PARTS)[number];

export type Slide = {
  id: string;
  part: SlidePart;
  /** Big, on screen. */
  title: string;
  /** A short line or a word, on screen. */
  text?: string;
  /** A word or phrase the Listen button reads aloud. */
  say?: string;
  /** Shown when there is no picture: the lesson never waits for one. */
  emoji?: string;
  /** What a picture would show, for the image model. No brands or characters. */
  picture?: string;
  /** The drawn picture, a file in data/plan-images. */
  image?: string;
  /** A ready-made picture from public/ (the Bible stories: never drawn by a model). */
  art?: string;
  /** For the tutor only: never on the child's screen. */
  notes?: string;
  /**
   * A group of mixed levels: the same slide one step up, for the stronger
   * children. The slide itself stays at the weakest child's level; the tutor
   * reveals this on top of it.
   */
  harder?: SlideStep;
  /** Changed by the tutor by hand: a rebuild keeps it as it is. */
  editedAt?: string;
};

export type SlideStep = { title?: string; text?: string; say?: string };

export const SHEET_KINDS = ["wordcards", "worksheet", "coloring", "match", "wordsearch", "reading"] as const;
export type SheetKind = (typeof SHEET_KINDS)[number];
/** What a card prints when the tutor has not chosen: the three it always had. */
export const DEFAULT_SHEETS: SheetKind[] = ["wordcards", "worksheet", "coloring"];

/** One printable A4 page. */
export type Sheet = {
  id: string;
  kind: SheetKind;
  title: string;
  /**
   * Word cards: the words. Worksheet: the lines, with ___ for a gap.
   * Word search: the words hidden in the grid. Reading: the questions.
   */
  items: string[];
  /** Worksheet and reading: the answers, for the tutor's copy. */
  answers?: string[];
  /** Colouring page: what the outline drawing shows. */
  picture?: string;
  image?: string;
  /** Match: each word with the emoji that shows it. */
  pairs?: { word: string; emoji: string }[];
  /** Word search: the rows of letters. */
  grid?: string[];
  /** Reading: the short text to read. */
  text?: string;
};

/** A search to run, not a checked video: the tutor watches it first. */
export type VideoIdea = { platform: "YouTube" | "Bilibili"; query: string; what: string };

export type PlanCardStatus = "planned" | "done" | "moved";

export type LessonMaterials = {
  slides: Slide[];
  sheets: Sheet[];
  videos: VideoIdea[];
  builtAt: string;
  /** The tutor's last wish the materials were rebuilt with. */
  wish?: string;
};

export type PlanCard = {
  id: string;
  topic: string;
  /** 3 to 6 words to learn. */
  words: string[];
  /** "Talk about animals, use can". */
  goal: string;
  /** How it follows on from the lessons before. */
  link?: string;
  source: "ai" | "tutor";
  status: PlanCardStatus;
  /** Not used yet: kept so a calendar can come later without moving data. */
  plannedDate?: string;
  /** The lesson taught from this card. */
  lessonId?: string;
  /** What the lesson actually covered, from its summary. */
  covered?: string[];
  /** Points carried over from an earlier card that were not reached. */
  carried?: string[];
  materials?: LessonMaterials;
  /** Materials being made in the background. */
  building?: { since: string; step: string };
  buildError?: string;
  /** When the offline pack was last downloaded; stale once updatedAt passes it. */
  packAt?: string;
  /** The sheets the tutor ticked to print; DEFAULT_SHEETS until they choose. */
  sheetKinds?: SheetKind[];
  /** Who the materials were written for, without naming anyone: for the library. */
  audience?: { ages: number[]; level?: string };
  /** The tutor's own note on how it went. */
  mark?: "worked" | "not";
  /**
   * Library visibility. Everything is "private" for now; the field is here so
   * a shared library can open later without moving data.
   */
  visibility?: "private" | "shared";
  /** Copied from another card in the library. */
  copiedFrom?: string;
  /**
   * A Bible story for a live lesson (the Christianity track). Kept apart from
   * the ordinary plan: the model never adds one, and it shows only while the
   * programme is open to the tutor and switched on for every child.
   */
  story?: { storyId: string };
  updatedAt: string;
};

/**
 * A learner's (or a saved group's) lessons, in order: a board of cards. One
 * active plan each. A card named by the tutor and a month suggested by the
 * model end up on the same board.
 */
export type LessonPlan = {
  id: string;
  tutorId: string;
  studentId?: string;
  groupId?: string;
  /** What the parents want, which is not always what the child likes. */
  parentWishes?: string;
  durationMinutes: 30 | 45 | 60;
  cards: PlanCard[];
  /** A month of cards being suggested in the background. */
  suggesting?: { since: string };
  suggestError?: string;
  createdAt: string;
  archivedAt?: string;
};

export type PlanCheck = {
  done: string[];
  partial: string[];
  missed: string[];
  /**
   * Points with no evidence either way, for the tutor to confirm. Absent on
   * checks from before it existed, which counted such points as missed.
   */
  unclear?: string[];
  at: string;
  /** The tutor's answer on carrying the rest to the next card. */
  carried?: "yes" | "no";
};

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
