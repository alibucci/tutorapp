"use client";

import { api } from "@/lib/api";
import Link from "next/link";
import { useState } from "react";
import { useSpeechTranscript } from "@/hooks/useSpeechTranscript";
import { pixelFont } from "@/lib/fonts";
import { type GameStyle, paletteVars, skinOf } from "@/lib/gameStyles";
import { PracticeGame } from "@/components/PracticeGame";
import {
  ADJECTIVES_TASK,
  EXERCISE_LABEL,
  HOMEWORK_TASKS,
  type Exercise,
  type ExerciseResult,
  type HomeworkAnswers,
  type RoundReply,
} from "@/lib/types";


const TASKS = [
  ...HOMEWORK_TASKS.map((t) => ({ id: t.id, prompt: t.prompt, hint: t.hint })),
  { id: "adjectives", prompt: ADJECTIVES_TASK, hint: "Say them or type them - one word in each box." },
];
/** A point per round answered right first time, so the most on offer is the
 *  number of rounds. Picture tasks are not scored - there is no right answer. */
function pointsOnOffer(exercises: Exercise[] | undefined): number {
  return (exercises ?? []).reduce((n, e) => n + e.rounds.length, 0);
}

type Step =
  | { type: "game"; exercise: Exercise }
  | { type: "task"; task: (typeof TASKS)[number] };

/**
 * The child's homework, dressed as the game they chose.
 *
 * The whole screen belongs to the game - no app chrome - because it should feel
 * like opening a game, not a form. One task per screen with the picture always
 * in view, so a child never scrolls to find what they are describing. Progress
 * is shown the way the game shows it: a hotbar slot per task and an XP bar.
 */
export function HomeworkGame({
  lessonId,
  imageSrc,
  focus,
  style,
  linkKey,
  backHref,
  answered,
  exercises,
  finished,
  results,
  preview,
}: {
  lessonId: string;
  /** Empty when this homework is games only. */
  imageSrc?: string;
  focus: string;
  style: GameStyle;
  /** The private link key, when the child came in by link rather than login. */
  linkKey?: string;
  backHref: string;
  answered?: HomeworkAnswers;
  /** Practice games built from the lesson, played before the picture. */
  exercises?: Exercise[];
  /** Everything was already handed in: open on the last screen. */
  finished?: boolean;
  /** Scores from earlier sittings, so coming back shows how it went. */
  results?: ExerciseResult[];
  /** The tutor looking at the child's screen. Nothing is recorded. */
  preview?: boolean;
}) {
  // Games first - they are quick and they warm up the words the picture task
  // then asks the child to use.
  const steps: Step[] = [
    ...(exercises ?? []).map((exercise) => ({ type: "game" as const, exercise })),
    ...(imageSrc ? TASKS.map((task) => ({ type: "task" as const, task })) : []),
  ];

  // 0 = intro, 1..steps.length = a step, steps.length + 1 = done.
  const [step, setStep] = useState(finished ? steps.length + 1 : 0);
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [adjectives, setAdjectives] = useState(["", "", ""]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** This sitting's scores, so the last screen can say how it went. */
  const [scores, setScores] = useState<
    { kind: Exercise["kind"]; right: number; total: number }[]
  >(() => (results ?? []).map((r) => ({ kind: r.kind, right: r.right, total: r.total })));
  /** Rounds answered right first time, across the whole quest. */
  // Opening a finished quest shows what was scored before, not a zero.
  const [points, setPoints] = useState(() =>
    finished ? (results ?? []).reduce((n, r) => n + r.right, 0) : 0,
  );
  /** Bumped on a replay so the game starts from a clean slate. */
  const [replay, setReplay] = useState(0);
  /** Rounds answered so far in the game on screen, for the bar. */
  const [inGame, setInGame] = useState(0);

  // Speaking instead of typing, for children who cannot type yet. The
  // browser's recogniser turns speech into text; nothing records or keeps the
  // child's voice here - only the words land in the answer.
  const speech = useSpeechTranscript("en-US");
  const [listeningFor, setListeningFor] = useState<string | null>(null);

  /** Start listening - synchronously, inside the tap, or iOS refuses. */
  function startMic(field: string) {
    setError(null);
    speech.start();
    setListeningFor(field);
  }

  /** Stop, wait for the last words, and put what was said into the field. */
  async function stopMic() {
    const field = listeningFor;
    setListeningFor(null);
    const said = (await speech.stopAndFlush()).map((s) => s.text).join(" ").trim();
    if (!field || !said) return;
    if (field === "adjectives") {
      // "big, happy and loud" -> three boxes.
      const words = said
        .toLowerCase()
        .replace(/[.,!?;:]/g, " ")
        .split(/\s+/)
        .filter((w) => w && !FILLER.has(w));
      setAdjectives((current) => {
        const next = [...current];
        for (const word of words) {
          const slot = next.findIndex((v) => !v.trim());
          if (slot === -1) break;
          next[slot] = word;
        }
        return next;
      });
      return;
    }
    setTexts((t) => {
      const before = (t[field] ?? "").trim();
      const sentence = said.charAt(0).toUpperCase() + said.slice(1);
      const ended = /[.!?]$/.test(sentence) ? sentence : `${sentence}.`;
      return { ...t, [field]: before ? `${before} ${ended}` : ended };
    });
  }

  /** Moving between tasks never leaves the microphone listening. */
  function go(next: number) {
    if (listeningFor) speech.stop();
    setListeningFor(null);
    setStep(next);
  }

  const mic = (field: string) =>
    speech.supported ? (
      <MicButton
        listening={listeningFor === field}
        busy={listeningFor !== null && listeningFor !== field}
        interim={listeningFor === field ? speech.interim : ""}
        error={listeningFor === null ? speech.error : null}
        onStart={() => startMic(field)}
        onStop={() => void stopMic()}
      />
    ) : null;

  const current = step >= 1 && step <= steps.length ? steps[step - 1] : null;
  const task = current?.type === "task" ? current.task : null;
  const game = current?.type === "game" ? current.exercise : null;
  const done = step > steps.length;
  const completed = done ? steps.length : Math.max(0, step - 1);
  const maxPoints = pointsOnOffer(exercises);
  const slice = 100 / Math.max(1, steps.length);
  const within = game && game.rounds.length ? Math.min(1, inGame / game.rounds.length) : 0;
  const progressPercent = Math.min(100, completed * slice + within * slice);

  /** A finished game sends what was answered; the server marks it. */
  async function finishGame(kind: Exercise["kind"], replies: RoundReply[]) {
    const exercise = (exercises ?? []).find((e) => e.kind === kind);
    const total = exercise?.rounds.length ?? 0;
    setInGame(0);

    // Sent without waiting: a child should never watch a spinner because the
    // network is slow. The marked score comes back and replaces the guess.
    const guess = { kind, right: 0, total };
    setScores((all) => [...all.filter((s) => s.kind !== kind), guess]);
    // A tutor trying the game must not write a score to the child's record.
    // The server refuses it too; this only avoids the pointless request - the
    // quest itself carries on, or a preview would stop at the first game.
    if (!preview) {
      void api<{ right: number; total: number }>(`/api/lessons/${lessonId}/homework/results`, {
        method: "POST",
        json: { key: linkKey, kind, replies },
      }).then((result) => {
        if (result.ok) {
          setScores((all) => [
            ...all.filter((s) => s.kind !== kind),
            { kind, right: result.data.right, total: result.data.total },
          ]);
        }
      });
    }

    if (step >= steps.length) {
      // Games only: there is nothing to hand in afterwards.
      setStep(steps.length + 1);
      return;
    }
    go(step + 1);
  }

  /** Start the whole quest over. Scores update; the first go is kept. */
  function playAll() {
    setInGame(0);
    setPoints(0);
    setReplay((n) => n + 1);
    go(1);
  }

  /** Play a game again from the last screen. The new score replaces the old. */
  function playAgain(kind: Exercise["kind"]) {
    const index = steps.findIndex((s) => s.type === "game" && s.exercise.kind === kind);
    if (index < 0) return;
    setInGame(0);
    setReplay((n) => n + 1);
    go(index + 1);
  }

  async function submit() {
    setBusy(true);
    setError(null);
    const result = await api(`/api/lessons/${lessonId}/homework/answers`, {
      method: "POST",
      json: {
        key: linkKey,
        describe: texts.describe,
        next: texts.next,
        adjectives,
      },
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setStep(steps.length + 1);
  }

  return (
    <div
      className={`game game-${skinOf(style)} ${pixelFont.variable}`}
      style={paletteVars(style) as React.CSSProperties}
    >
      <div className="game-inner" data-answering={task ? "" : undefined}>
        <div className="flex items-center justify-between">
          <Link href={backHref} className="game-small">
            ← Back
          </Link>
          <span className="game-small">{preview ? "Preview" : style.name}</span>
        </div>

        {preview && (
          <p className="game-tip">
            <span className="game-small">You are seeing this as the child does.</span>{" "}
            Nothing you answer here is saved.
          </p>
        )}

        {imageSrc && !game && (
          <div className="game-frame">
            {/* eslint-disable-next-line @next/next/no-img-element -- private upload */}
            <img src={imageSrc} alt="Your homework picture" className="game-picture" />
          </div>
        )}

        {step === 0 && (
          <div className="game-panel">
            <p className="game-title">New quest!</p>
            <p className="game-text mt-3">
              {exercises?.length
                ? imageSrc
                  ? `${exercises.length} quick games, then the picture.`
                  : `${exercises.length} quick games.`
                : "Look at the picture."}{" "}
              {steps.length} {steps.length === 1 ? "task" : "tasks"}
              {maxPoints > 0 && `, up to ${maxPoints} ${style.words.reward}`}.
            </p>
            {focus && (
              <p className="game-tip mt-3">
                <span className="game-small">Tip</span> {focus}
              </p>
            )}
            <button onClick={() => go(1)} className="game-button mt-5">
              {style.words.start}
            </button>
          </div>
        )}

        {game && (
          <PracticeGame
            key={`${game.kind}-${step}-${replay}`}
            exercise={game}
            words={{ submit: style.words.submit }}
            onRound={(right) => {
              setInGame((n) => n + 1);
              if (right) setPoints((n) => n + 1);
            }}
            onDone={(replies) => void finishGame(game.kind, replies)}
          />
        )}

        {task && task.id !== "adjectives" && (
          <div className="game-panel" key={task.id}>
            <p className="game-small game-step">
              {style.words.step} {step}
            </p>
            <p className="game-title mt-2">{task.prompt}</p>
            <p className="game-hint mt-2">{task.hint}</p>
            {mic(task.id)}
            <textarea
              value={texts[task.id] ?? ""}
              onChange={(e) => setTexts((t) => ({ ...t, [task.id]: e.target.value }))}
              rows={5}
              autoCapitalize="sentences"
              className="game-input mt-4"
            />
            <div className="mt-4 flex gap-3">
              <button onClick={() => go(step - 1)} className="game-button game-button-small">
                ←
              </button>
              <button
                onClick={() => go(step + 1)}
                disabled={!(texts[task.id] ?? "").trim()}
                className="game-button"
              >
                Next
              </button>
            </div>
          </div>
        )}

        {task?.id === "adjectives" && (
          <div className="game-panel">
            <p className="game-small game-step">
              {style.words.step} {step}
            </p>
            <p className="game-title mt-2">{task.prompt}</p>
            <p className="game-hint mt-2">{task.hint}</p>
            {mic("adjectives")}
            <div className="mt-4 space-y-3">
              {adjectives.map((value, i) => (
                <input
                  key={i}
                  value={value}
                  onChange={(e) =>
                    setAdjectives((a) => a.map((v, j) => (j === i ? e.target.value : v)))
                  }
                  placeholder={`Adjective ${i + 1}`}
                  autoCapitalize="none"
                  autoCorrect="off"
                  className="game-input"
                />
              ))}
            </div>
            {error && <p className="game-error mt-3">{error}</p>}
            <div className="mt-4 flex gap-3">
              <button onClick={() => go(step - 1)} className="game-button game-button-small">
                ←
              </button>
              <button
                onClick={() => void submit()}
                disabled={busy || adjectives.some((a) => !a.trim())}
                className="game-button"
              >
                {busy ? "…" : style.words.submit}
              </button>
            </div>
          </div>
        )}

        {done && (
          <div className="game-toast" role="status">
            <span aria-hidden className="game-toast-icon" />
            <span>
              <span className="game-toast-title">{style.words.cheer}</span>
              <span className="game-toast-text">{style.words.done}</span>
            </span>
          </div>
        )}
        {done && (
          <div className="game-panel">
            <p className="game-text">
              {points} {style.words.reward}. Your tutor will see how you did.
            </p>
            {scores.length > 0 && (
              <ul className="mt-4 space-y-2">
                {scores.map((s) => (
                  <li key={s.kind} className="game-score">
                    <span>{EXERCISE_LABEL[s.kind]}</span>
                    <span className="flex items-center gap-3">
                      <span className="game-score-n">
                        {s.right}/{s.total}
                      </span>
                      <button
                        onClick={() => playAgain(s.kind)}
                        className="game-score-again"
                      >
                        Play again
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {answered && (
              <div className="mt-4 space-y-3">
                <Answer label={TASKS[0].prompt} text={answered.describe} />
                <Answer label={TASKS[1].prompt} text={answered.next} />
                <Answer label="Your three words" text={answered.adjectives.join(" · ")} />
              </div>
            )}
            <div className="mt-4 flex gap-3">
              <Link href={backHref} className="game-button game-button-no block">
                Back
              </Link>
              {steps.some((s) => s.type === "game") && (
                <button onClick={playAll} className="game-button">
                  Play it all again
                </button>
              )}
            </div>
          </div>
        )}

        {/* The hotbar: one slot per task, the current one selected. */}
        <div className="game-hud">
          <p className="game-level">
            {points} {style.words.reward}
          </p>
          <div
            className="game-xp"
            aria-label={`${completed} of ${steps.length} done`}
          >
            {/* Whole steps behind, and the game in hand filling the next slot,
                so something moves on every answer rather than once a game. */}
            <div
              className="game-xp-fill"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <ol className="game-hotbar">
            {steps.map((s, i) => (
              <li
                key={s.type === "game" ? `g${i}` : s.task.id}
                className={`game-slot ${step === i + 1 ? "game-slot-on" : ""} ${
                  i < completed ? "game-slot-done" : ""
                }`}
              >
                {i + 1}
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}

function Answer({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <p className="game-hint">{label}</p>
      <p className="game-answer mt-1">{text}</p>
    </div>
  );
}

/** Words a child says around adjectives that are not adjectives. */
const FILLER = new Set(["and", "um", "uh", "er", "like", "it's", "is", "very", "the", "a"]);

/**
 * The big microphone. Tap to talk, tap again to stop; the words appear in the
 * answer, where the child can still fix them by hand.
 */
function MicButton({
  listening,
  busy,
  interim,
  error,
  onStart,
  onStop,
}: {
  listening: boolean;
  busy: boolean;
  interim: string;
  error: string | null;
  onStart: () => void;
  onStop: () => void;
}) {
  return (
    <div className="mt-4 flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={listening ? onStop : onStart}
        disabled={busy}
        aria-pressed={listening}
        aria-label={listening ? "Stop talking" : "Talk your answer"}
        className={`game-mic ${listening ? "game-mic-on" : ""}`}
      >
        {listening ? (
          <svg aria-hidden width="34" height="34" viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="6" width="12" height="12" rx="2" />
          </svg>
        ) : (
          <svg aria-hidden width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="2" width="6" height="12" rx="3" />
            <path d="M5 10a7 7 0 0 0 14 0M12 19v3" />
          </svg>
        )}
      </button>
      <p className="game-hint text-center min-h-[1.5rem]">
        {listening
          ? interim || "I'm listening… tap again when you finish."
          : error
            ? "The microphone did not work. You can type instead."
            : "Tap and say it - or type below."}
      </p>
    </div>
  );
}
