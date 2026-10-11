"use client";

import { api } from "@/lib/api";
import Link from "next/link";
import { useState } from "react";
import { pixelFont } from "@/lib/fonts";
import type { GameStyle } from "@/lib/gameStyles";
import { ADJECTIVES_TASK, HOMEWORK_TASKS, type HomeworkAnswers } from "@/lib/types";


const TASKS = [
  ...HOMEWORK_TASKS.map((t) => ({ id: t.id, prompt: t.prompt, hint: t.hint })),
  { id: "adjectives", prompt: ADJECTIVES_TASK, hint: "One word in each box." },
];
const XP_PER_TASK = 10;

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
}: {
  lessonId: string;
  imageSrc: string;
  focus: string;
  style: GameStyle;
  /** The private link key, when the child came in by link rather than login. */
  linkKey?: string;
  backHref: string;
  answered?: HomeworkAnswers;
}) {
  // 0 = intro, 1..TASKS.length = a task, TASKS.length + 1 = done.
  const [step, setStep] = useState(answered ? TASKS.length + 1 : 0);
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [adjectives, setAdjectives] = useState(["", "", ""]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const task = step >= 1 && step <= TASKS.length ? TASKS[step - 1] : null;
  const done = step > TASKS.length;
  const completed = done ? TASKS.length : Math.max(0, step - 1);

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
    setStep(TASKS.length + 1);
  }

  return (
    <div className={`game game-${style.id} ${pixelFont.variable}`}>
      <div className="game-inner" data-answering={task ? "" : undefined}>
        <div className="flex items-center justify-between">
          <Link href={backHref} className="game-small">
            ← Back
          </Link>
          <span className="game-small">{style.name}</span>
        </div>

        <div className="game-frame">
          {/* eslint-disable-next-line @next/next/no-img-element -- private upload */}
          <img src={imageSrc} alt="Your homework picture" className="game-picture" />
        </div>

        {step === 0 && (
          <div className="game-panel">
            <p className="game-title">New quest!</p>
            <p className="game-text mt-3">
              Look at the picture. {TASKS.length} tasks, {TASKS.length * XP_PER_TASK}{" "}
              {style.words.reward}.
            </p>
            {focus && (
              <p className="game-tip mt-3">
                <span className="game-small">Tip</span> {focus}
              </p>
            )}
            <button onClick={() => setStep(1)} className="game-button mt-5">
              {style.words.start}
            </button>
          </div>
        )}

        {task && task.id !== "adjectives" && (
          <div className="game-panel" key={task.id}>
            <p className="game-small game-step">
              {style.words.step} {step}
            </p>
            <p className="game-title mt-2">{task.prompt}</p>
            <p className="game-hint mt-2">{task.hint}</p>
            <textarea
              value={texts[task.id] ?? ""}
              onChange={(e) => setTexts((t) => ({ ...t, [task.id]: e.target.value }))}
              rows={5}
              autoCapitalize="sentences"
              className="game-input mt-4"
            />
            <div className="mt-4 flex gap-3">
              <button onClick={() => setStep(step - 1)} className="game-button game-button-small">
                ←
              </button>
              <button
                onClick={() => setStep(step + 1)}
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
              <button onClick={() => setStep(step - 1)} className="game-button game-button-small">
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
              <span className="game-toast-title">Achievement get!</span>
              <span className="game-toast-text">{style.words.done}</span>
            </span>
          </div>
        )}
        {done && (
          <div className="game-panel">
            <p className="game-text">
              +{TASKS.length * XP_PER_TASK} {style.words.reward}. Your tutor will
              read your answers.
            </p>
            {answered && (
              <div className="mt-4 space-y-3">
                <Answer label={TASKS[0].prompt} text={answered.describe} />
                <Answer label={TASKS[1].prompt} text={answered.next} />
                <Answer label="Your three words" text={answered.adjectives.join(" · ")} />
              </div>
            )}
            <Link href={backHref} className="game-button mt-4 block">
              Back
            </Link>
          </div>
        )}

        {/* The hotbar: one slot per task, the current one selected. */}
        <div className="game-hud">
          <p className="game-level">{completed * XP_PER_TASK}</p>
          <div className="game-xp" aria-label={`${completed} of ${TASKS.length} done`}>
            <div
              className="game-xp-fill"
              style={{ width: `${(completed / TASKS.length) * 100}%` }}
            />
          </div>
          <ol className="game-hotbar">
            {TASKS.map((t, i) => (
              <li
                key={t.id}
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
