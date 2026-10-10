"use client";

import { Press_Start_2P } from "next/font/google";
import Link from "next/link";
import { useState } from "react";
import type { GameStyle } from "@/lib/gameStyles";
import { ADJECTIVES_TASK, HOMEWORK_TASKS, type HomeworkAnswers } from "@/lib/types";

// Self-hosted at build time - nothing is fetched from Google by the browser,
// which matters for children in China.
const pixel = Press_Start_2P({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-pixel",
});

const STEPS = HOMEWORK_TASKS.length + 1;

/**
 * The child's homework, dressed as a game.
 *
 * One task per screen with the picture always in view - a child should never
 * scroll to find what they are describing. Progress is a bar that fills, not a
 * "2 of 3", because that is what the games they play do.
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
  const [step, setStep] = useState(answered ? STEPS + 1 : 0);
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [adjectives, setAdjectives] = useState(["", "", ""]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const task = step >= 1 && step <= HOMEWORK_TASKS.length ? HOMEWORK_TASKS[step - 1] : null;
  const onAdjectives = step === STEPS;
  const done = step > STEPS;
  const progress = Math.min(step, STEPS) / STEPS;

  async function submit() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/lessons/${lessonId}/homework/answers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        key: linkKey,
        describe: texts.describe,
        next: texts.next,
        adjectives,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      const body = (await res.json()) as { error?: string };
      setError(body.error ?? "Something went wrong. Try again.");
      return;
    }
    setStep(STEPS + 1);
  }

  return (
    <div className={`game game-${style.id} ${pixel.variable}`}>
      <div className="game-bar" aria-label="Progress">
        <div className="game-bar-fill" style={{ width: `${progress * 100}%` }} />
        <span className="game-bar-label">
          {Math.round(progress * 30)} {style.words.reward}
        </span>
      </div>

      {/* eslint-disable-next-line @next/next/no-img-element -- private upload */}
      <img src={imageSrc} alt="Your homework picture" className="game-picture" />

      {step === 0 && (
        <div className="game-panel">
          <p className="game-title">New quest!</p>
          {focus && <p className="game-text mt-3">{focus}</p>}
          <button onClick={() => setStep(1)} className="game-button mt-5">
            {style.words.start}
          </button>
        </div>
      )}

      {task && (
        <div className="game-panel" key={task.id}>
          <p className="game-label">
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
          <button
            onClick={() => setStep(step + 1)}
            disabled={!(texts[task.id] ?? "").trim()}
            className="game-button mt-4"
          >
            Next
          </button>
        </div>
      )}

      {onAdjectives && (
        <div className="game-panel">
          <p className="game-label">
            {style.words.step} {step}
          </p>
          <p className="game-title mt-2">{ADJECTIVES_TASK}</p>
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
                className="game-input"
              />
            ))}
          </div>
          {error && <p className="game-hint mt-3">{error}</p>}
          <button
            onClick={() => void submit()}
            disabled={busy || adjectives.some((a) => !a.trim())}
            className="game-button mt-4"
          >
            {busy ? "…" : style.words.submit}
          </button>
        </div>
      )}

      {done && (
        <div className="game-panel text-center">
          <p className="game-title">{style.words.done}</p>
          <p className="game-text mt-3">+30 {style.words.reward}</p>
          <p className="game-hint mt-2">Your tutor will read your answers.</p>
          <Link href={backHref} className="game-button mt-5 inline-block">
            Back
          </Link>
        </div>
      )}

      {step > 0 && !done && (
        <button
          onClick={() => setStep(step - 1)}
          className="game-back mt-3"
        >
          ← Back
        </button>
      )}
    </div>
  );
}
