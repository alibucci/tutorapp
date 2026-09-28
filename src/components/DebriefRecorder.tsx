"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { LevelMeter } from "@/components/LevelMeter";
import { useSpeechTranscript } from "@/hooks/useSpeechTranscript";
import { useTutorRecorder } from "@/hooks/useTutorRecorder";
import { useWakeLock } from "@/hooks/useWakeLock";
import {
  DEBRIEF_PROMPTS,
  DEBRIEF_TOTAL_SECONDS,
  type DebriefAnswer,
  type Lesson,
} from "@/lib/types";

type Phase = "ready" | "running" | "review";

export function DebriefRecorder({ lesson }: { lesson: Lesson }) {
  const router = useRouter();
  const rec = useTutorRecorder({
    upload: { lessonId: lesson.id, kind: "debrief" },
  });
  const speech = useSpeechTranscript(lesson.language);
  const wakeLock = useWakeLock();

  const [phase, setPhase] = useState<Phase>("ready");
  const [index, setIndex] = useState(0);
  const [remaining, setRemaining] = useState<number>(DEBRIEF_PROMPTS[0].seconds);
  const [answers, setAnswers] = useState<DebriefAnswer[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Start ms (relative to the debrief) of each prompt, so a tutor can advance early. */
  const boundariesRef = useRef<number[]>([]);
  const startedAtRef = useRef(0);
  const indexRef = useRef(0);
  /** Wall-clock deadline for the current prompt, not a tick count. */
  const deadlineRef = useRef(0);

  useEffect(() => {
    void rec.arm();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const finish = useCallback(() => {
    speech.stop();
    void rec.stop();
    void wakeLock.release();
    setPhase("review");
  }, [rec, speech, wakeLock]);

  const advance = useCallback(() => {
    const next = indexRef.current + 1;
    if (next >= DEBRIEF_PROMPTS.length) {
      finish();
      return;
    }
    indexRef.current = next;
    boundariesRef.current.push(performance.now() - startedAtRef.current);
    deadlineRef.current = performance.now() + DEBRIEF_PROMPTS[next].seconds * 1000;
    setIndex(next);
    setRemaining(DEBRIEF_PROMPTS[next].seconds);
  }, [finish]);

  // Driven off a wall-clock deadline rather than counted ticks: a backgrounded
  // tab has its timers throttled to about one call a minute, and a decremented
  // counter would simply be wrong on return. This catches up instead.
  useEffect(() => {
    if (phase !== "running") return;

    const id = window.setInterval(() => {
      let left = deadlineRef.current - performance.now();
      while (left <= 0 && indexRef.current < DEBRIEF_PROMPTS.length - 1) {
        advance();
        left = deadlineRef.current - performance.now();
      }
      if (left <= 0) {
        finish();
        return;
      }
      setRemaining(Math.ceil(left / 1000));
    }, 250);

    return () => window.clearInterval(id);
  }, [phase, advance, finish]);

  // Split the transcript across prompts by when each one was on screen.
  useEffect(() => {
    if (phase !== "review") return;
    const bounds = boundariesRef.current;
    setAnswers(
      DEBRIEF_PROMPTS.map((prompt, i) => {
        const from = i === 0 ? 0 : (bounds[i - 1] ?? Infinity);
        const to = bounds[i] ?? Infinity;
        const text = speech.segments
          .filter((s) => s.t >= from && s.t < to)
          .map((s) => s.text)
          .join(" ");
        return { promptId: prompt.id, text };
      }),
    );
  }, [phase, speech.segments]);

  async function begin() {
    await wakeLock.acquire();
    boundariesRef.current = [];
    indexRef.current = 0;
    startedAtRef.current = performance.now();
    deadlineRef.current =
      performance.now() + DEBRIEF_PROMPTS[0].seconds * 1000;
    setIndex(0);
    setRemaining(DEBRIEF_PROMPTS[0].seconds);
    speech.start();
    await rec.start();
    setPhase("running");
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/lessons/${lesson.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          debrief: answers,
          debriefTranscript: speech.segments,
        }),
      });
      if (!res.ok) throw new Error("Could not save the debrief.");
      router.push(`/lesson/${lesson.id}/review`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Saving failed.");
      setSaving(false);
    }
  }

  if (phase === "ready") {
    return (
      <div className="space-y-6">
        <ol className="space-y-2 card p-5 t-small">
          {DEBRIEF_PROMPTS.map((p) => (
            <li key={p.id} className="flex justify-between gap-4">
              <span>{p.label}</span>
              <span className="shrink-0 font-mono t-caption t-muted">
                {p.seconds}s
              </span>
            </li>
          ))}
        </ol>
        <div className="space-y-2">
          <LevelMeter level={rec.level} gateOpen />
          <p className="t-caption t-muted">
            Check the bar moves when you speak, then start. Prompts advance on
            their own; you can skip ahead at any time.
          </p>
        </div>
        {rec.error && <p className="note note-warn">{rec.error}</p>}
        <button
          onClick={() => void begin()}
          disabled={rec.state === "idle"}
          className="btn btn-primary btn-lg"
        >
          Start debrief ({DEBRIEF_TOTAL_SECONDS}s)
        </button>
      </div>
    );
  }

  if (phase === "running") {
    const prompt = DEBRIEF_PROMPTS[index];
    return (
      <div className="stack-lg">
        <div className="card p-8 text-center">
          <p className="t-eyebrow">
            {index + 1} of {DEBRIEF_PROMPTS.length}
          </p>
          <p className="mt-3 t-title">
            {prompt.label}
          </p>
          <p className="t-num mt-6 text-[3.5rem] leading-none" style={{ color: "var(--accent)" }}>
            {remaining}
          </p>
        </div>

        <LevelMeter level={rec.level} gateOpen={rec.gateOpen} />

        {speech.interim && (
          <p className="text-center t-small t-muted">{speech.interim}</p>
        )}

        <div className="flex justify-center gap-3">
          <button
            onClick={advance}
            className="btn btn-quiet"
          >
            Next prompt
          </button>
          <button
            onClick={finish}
            className="btn btn-quiet"
          >
            Finish early
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <p className="t-small t-muted">
        Transcribed from what you said. Fix anything the recogniser got wrong -
        it goes straight into the summary.
      </p>

      {DEBRIEF_PROMPTS.map((prompt, i) => (
        <label key={prompt.id} className="block">
          <span className="label">{prompt.label}</span>
          <textarea
            value={answers[i]?.text ?? ""}
            onChange={(e) =>
              setAnswers((prev) =>
                prev.map((a) =>
                  a.promptId === prompt.id ? { ...a, text: e.target.value } : a,
                ),
              )
            }
            rows={3}
            className="field"
          />
        </label>
      ))}

      {error && <p className="note note-warn">{error}</p>}

      <button
        onClick={() => void save()}
        disabled={saving}
        className="btn btn-primary btn-lg"
      >
        {saving ? "Saving..." : "Save debrief"}
      </button>
    </div>
  );
}
