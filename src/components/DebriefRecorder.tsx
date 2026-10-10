"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { LevelMeter } from "@/components/LevelMeter";
import { useSpeechTranscript } from "@/hooks/useSpeechTranscript";
import { useTutorRecorder } from "@/hooks/useTutorRecorder";
import { useWakeLock } from "@/hooks/useWakeLock";
import {
  DEBRIEF_PROMPTS,
  DEBRIEF_TOTAL_SECONDS,
  type DebriefAnswer,
  type Lesson,
  type TranscriptSegment,
} from "@/lib/types";

type Phase = "ready" | "running" | "review";

/** How often a running debrief is copied to the server. */
const AUTOSAVE_MS = 5_000;

type Draft = { segments: TranscriptSegment[]; edits: Record<string, string> };

function draftKey(id: string) {
  return `tutor-signal:debrief:${id}`;
}

function readDraft(id: string): Draft | null {
  try {
    const raw = window.localStorage.getItem(draftKey(id));
    return raw ? (JSON.parse(raw) as Draft) : null;
  } catch {
    return null;
  }
}

export function DebriefRecorder({ lesson }: { lesson: Lesson }) {
  const router = useRouter();
  const rec = useTutorRecorder();
  const speech = useSpeechTranscript(lesson.language);
  const wakeLock = useWakeLock();

  // A debrief that was under way when the page died comes back on the review
  // screen with what had been said, rather than vanishing.
  const unfinished = lesson.debrief.length === 0 && lesson.debriefTranscript.length > 0;
  const [phase, setPhase] = useState<Phase>(unfinished ? "review" : "ready");
  const [index, setIndex] = useState(0);
  const [remaining, setRemaining] = useState<number>(DEBRIEF_PROMPTS[0].seconds);
  const [edits, setEdits] = useState<Record<string, string>>({});
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
    const local = readDraft(lesson.id);
    if (unfinished || local) {
      const server = lesson.debriefTranscript;
      speech.restore(
        local && local.segments.length > server.length ? local.segments : server,
      );
      // Device storage only exists after hydration, so this cannot be read
      // during render; restoring it here is a one-time sync from outside React.
      /* eslint-disable react-hooks/set-state-in-effect */
      if (local?.edits) setEdits(local.edits);
      if (local && local.segments.length) setPhase("review");
      /* eslint-enable react-hooks/set-state-in-effect */
    }
    // one-shot on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function finish() {
    speech.stop();
    void wakeLock.release();
    setPhase("review");
    rec.stop();
    saveRef.current(false);
  }

  function advance() {
    const next = indexRef.current + 1;
    if (next >= DEBRIEF_PROMPTS.length) {
      finish();
      return;
    }
    indexRef.current = next;
    speech.setTag(DEBRIEF_PROMPTS[next].id);
    boundariesRef.current.push(performance.now() - startedAtRef.current);
    deadlineRef.current = performance.now() + DEBRIEF_PROMPTS[next].seconds * 1000;
    setIndex(next);
    setRemaining(DEBRIEF_PROMPTS[next].seconds);
  }

  /** Copy what has been said so far to the server, without marking it done. */
  function saveProgress(keepalive: boolean) {
    const debriefTranscript = speech.segmentsRef.current;
    if (!debriefTranscript.length) return;
    void fetch(`/api/lessons/${lesson.id}`, {
      method: "PATCH",
      keepalive,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ debriefTranscript }),
    }).catch(() => {});
  }

  // The interval and the listeners below outlive any one render, so they call
  // through refs. Depending on the functions themselves tore the timer down on
  // every render - and the level meter re-renders ~24 times a second, so the
  // 250 ms tick never fired and the prompts never advanced on their own.
  const advanceRef = useRef(advance);
  const finishRef = useRef(finish);
  const saveRef = useRef(saveProgress);
  useEffect(() => {
    advanceRef.current = advance;
    finishRef.current = finish;
    saveRef.current = saveProgress;
  });

  // Driven off a wall-clock deadline rather than counted ticks: a backgrounded
  // tab has its timers throttled to about one call a minute, and a decremented
  // counter would simply be wrong on return. This catches up instead.
  useEffect(() => {
    if (phase !== "running") return;

    const id = window.setInterval(() => {
      let left = deadlineRef.current - performance.now();
      while (left <= 0 && indexRef.current < DEBRIEF_PROMPTS.length - 1) {
        advanceRef.current();
        left = deadlineRef.current - performance.now();
      }
      if (left <= 0) {
        finishRef.current();
        return;
      }
      setRemaining(Math.ceil(left / 1000));
    }, 250);

    const autosave = window.setInterval(() => saveRef.current(false), AUTOSAVE_MS);
    const onHide = () => {
      if (document.visibilityState === "hidden") saveRef.current(true);
    };
    const onPageHide = () => saveRef.current(true);
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onPageHide);

    return () => {
      window.clearInterval(id);
      window.clearInterval(autosave);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [phase]);

  // The device keeps its own copy too, including what the tutor has typed.
  useEffect(() => {
    if (phase === "ready") return;
    try {
      window.localStorage.setItem(
        draftKey(lesson.id),
        JSON.stringify({ segments: speech.segments, edits }),
      );
    } catch {
      // Private mode or full storage: the server copy still runs.
    }
  }, [phase, speech.segments, edits, lesson.id]);

  /**
   * What the tutor typed over the top, keyed by prompt. Everything else is
   * derived from the transcript on each render rather than copied into state
   * once, because the recogniser can still be handing over the last utterance
   * while the review screen is already up - a snapshot would miss it.
   */
  const answers: DebriefAnswer[] = DEBRIEF_PROMPTS.map((prompt) => ({
    promptId: prompt.id,
    text:
      edits[prompt.id] ??
      speech.segments
        .filter((s) => s.tag === prompt.id)
        .map((s) => s.text)
        .join(" "),
  }));

  async function begin() {
    await wakeLock.acquire();
    boundariesRef.current = [];
    indexRef.current = 0;
    startedAtRef.current = performance.now();
    deadlineRef.current =
      performance.now() + DEBRIEF_PROMPTS[0].seconds * 1000;
    setIndex(0);
    setRemaining(DEBRIEF_PROMPTS[0].seconds);
    speech.setTag(DEBRIEF_PROMPTS[0].id);
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
      try {
        window.localStorage.removeItem(draftKey(lesson.id));
      } catch {
        // nothing to clean
      }
      router.push(`/lesson/${lesson.id}/review`);
    } catch {
      setError(
        "Could not save - probably the connection. Nothing is lost: it is kept on this phone. Try again when you have signal.",
      );
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
        {rec.error && (
          <p className="note note-warn">
            The microphone is not available here ({rec.error}). Check the
            browser&rsquo;s microphone permission, or type the debrief instead.
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => void begin()}
            disabled={rec.state === "idle"}
            className="btn btn-primary btn-lg"
          >
            Start debrief ({DEBRIEF_TOTAL_SECONDS}s)
          </button>
          <button onClick={() => setPhase("review")} className="btn btn-quiet btn-lg">
            Type it instead
          </button>
        </div>
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
            onClick={() => advance()}
            className="btn btn-quiet"
          >
            Next prompt
          </button>
          <button
            onClick={() => finish()}
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
        {unfinished && Object.keys(edits).length === 0
          ? "This debrief was interrupted. Here is what was saved - check it, fill any gaps, then save."
          : "Transcribed from what you said. Fix anything the recogniser got wrong - it goes straight into the summary."}
      </p>

      {DEBRIEF_PROMPTS.map((prompt, i) => (
        <label key={prompt.id} className="block">
          <span className="label">{prompt.label}</span>
          <textarea
            value={answers[i]?.text ?? ""}
            onChange={(e) =>
              setEdits((prev) => ({ ...prev, [prompt.id]: e.target.value }))
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
