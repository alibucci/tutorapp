"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { LevelMeter } from "@/components/LevelMeter";
import { useClipTranscriber } from "@/hooks/useClipTranscriber";
import { useTutorRecorder } from "@/hooks/useTutorRecorder";
import { useWakeLock } from "@/hooks/useWakeLock";
import {
  DEBRIEF_PROMPTS,
  INTRO_PROMPTS,
  type DebriefAnswer,
  type Lesson,
  type TranscriptSegment,
} from "@/lib/types";

type Phase = "ready" | "running" | "review";

/** How often a running debrief is copied to the server. */
const AUTOSAVE_MS = 5_000;

/**
 * An answer goes to the recogniser in pieces as it is spoken, so its words
 * appear while the tutor is still talking. A piece ends at a pause once it is
 * a few seconds long, and at MAX whatever is happening.
 */
const MIN_PIECE_MS = 3_000;
const MAX_PIECE_MS = 20_000;
/** Quiet this long is a pause between phrases. */
const PAUSE_MS = 700;
/** Input level above which someone is speaking (0..1 RMS). */
const SPEAKING_LEVEL = 0.02;

type Draft = {
  segments: TranscriptSegment[];
  edits: Record<string, string>;
  /** What was typed while recording, by prompt. */
  typed?: Record<string, string>;
};

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
  // An intro note asks about the child; a debrief asks about the lesson.
  const PROMPTS: readonly { id: string; label: string }[] =
    lesson.kind === "intro" ? INTRO_PROMPTS : DEBRIEF_PROMPTS;
  const router = useRouter();
  const rec = useTutorRecorder();
  const speech = useClipTranscriber(lesson.language);
  const wakeLock = useWakeLock();

  // A debrief that was under way when the page died comes back on the review
  // screen with what had been said, rather than vanishing.
  const unfinished = lesson.debrief.length === 0 && lesson.debriefTranscript.length > 0;
  const [phase, setPhase] = useState<Phase>(unfinished ? "review" : "ready");
  const [index, setIndex] = useState(0);
  const [edits, setEdits] = useState<Record<string, string>>({});
  /** Typed during recording, alongside what is said. */
  const [typed, setTyped] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  /** The last clip is still being written after Finish. */
  const [closing, setClosing] = useState(false);
  const [confirmRestart, setConfirmRestart] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Start ms (relative to the debrief) of each prompt, so a tutor can advance early. */
  const boundariesRef = useRef<number[]>([]);
  const startedAtRef = useRef(0);
  const indexRef = useRef(0);
  /** When the clip now recording began, ms into the debrief. */
  const clipStartRef = useRef(0);
  /** When the voice was last above SPEAKING_LEVEL, and whether this piece has any. */
  const lastLoudRef = useRef(0);
  const heardRef = useRef(false);
  useEffect(() => {
    if (rec.level > SPEAKING_LEVEL) {
      lastLoudRef.current = performance.now();
      heardRef.current = true;
    }
  }, [rec.level]);

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
      if (local?.typed) setTyped(local.typed);
      if (local && local.segments.length) setPhase("review");
      /* eslint-enable react-hooks/set-state-in-effect */
    }
    // one-shot on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * End the clip for the prompt on screen and send it off. Each prompt is its
   * own recording, so an answer is tagged by where it was said, not by when
   * the text came back.
   */
  function cutClip(): Promise<void> {
    const tag = PROMPTS[indexRef.current].id;
    const t = clipStartRef.current;
    return rec.endClip().then((clip) => {
      if (clip) void speech.send(clip, t, tag);
    });
  }

  function finish() {
    void wakeLock.release();
    setPhase("review");
    // The microphone is let go only once the last clip has been written.
    setClosing(true);
    void cutClip().then(() => {
      rec.release();
      setClosing(false);
    });
    saveRef.current(false);
  }

  function advance() {
    const next = indexRef.current + 1;
    if (next >= PROMPTS.length) {
      finish();
      return;
    }
    void cutClip();
    indexRef.current = next;
    clipStartRef.current = performance.now() - startedAtRef.current;
    heardRef.current = false;
    rec.startClip();
    boundariesRef.current.push(clipStartRef.current);
    setIndex(next);
  }

  /**
   * Send what has been said so far for this prompt once the tutor pauses, so
   * the text shows up as they go rather than only after "Next". Every piece
   * keeps the prompt's tag, so the answer is still one answer.
   */
  function splitAtPause() {
    const now = performance.now() - startedAtRef.current;
    const length = now - clipStartRef.current;
    const paused = performance.now() - lastLoudRef.current >= PAUSE_MS;
    const ready = heardRef.current && length >= MIN_PIECE_MS && paused;
    if (!ready && length < MAX_PIECE_MS) return;
    // Twenty seconds of silence is nothing to read, and every call is paid for.
    if (heardRef.current) void cutClip();
    else void rec.endClip();
    clipStartRef.current = now;
    heardRef.current = false;
    rec.startClip();
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
  // through refs. Depending on the functions themselves tore the interval down
  // on every render - the level meter re-renders ~24 times a second.
  const splitRef = useRef(splitAtPause);
  const saveRef = useRef(saveProgress);
  useEffect(() => {
    splitRef.current = splitAtPause;
    saveRef.current = saveProgress;
  });

  // The tutor moves on when they are done; nothing advances on its own.
  useEffect(() => {
    if (phase !== "running") return;

    const id = window.setInterval(() => splitRef.current(), 200);

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
  }, [phase, PROMPTS.length]);

  // The device keeps its own copy too, including what the tutor has typed.
  useEffect(() => {
    if (phase === "ready") return;
    try {
      window.localStorage.setItem(
        draftKey(lesson.id),
        JSON.stringify({ segments: speech.segments, edits, typed }),
      );
    } catch {
      // Private mode or full storage: the server copy still runs.
    }
  }, [phase, speech.segments, edits, typed, lesson.id]);

  /**
   * What the tutor typed over the top, keyed by prompt. Everything else is
   * derived from the transcript on each render rather than copied into state
   * once, because the recogniser can still be handing over the last utterance
   * while the review screen is already up - a snapshot would miss it.
   */
  const answers: DebriefAnswer[] = PROMPTS.map((prompt) => ({
    promptId: prompt.id,
    // Said and typed both count: a tutor may speak one answer and paste
    // another, or start by voice and add a line by hand.
    text:
      edits[prompt.id] ??
      [
        speech.segments
          .filter((s) => s.tag === prompt.id)
          .map((s) => s.text)
          .join(" "),
        typed[prompt.id]?.trim() ?? "",
      ]
        .filter(Boolean)
        .join("\n"),
  }));

  /**
   * Recording starts synchronously inside the tap, before any await: a
   * browser only lets audio run from a user's gesture, and one started after
   * an await can record silence.
   */
  function begin() {
    if (!rec.startClip()) {
      setError("The microphone is not ready. Allow it for this site and reload, or type your answers instead.");
      return;
    }
    setError(null);
    speech.reset();
    boundariesRef.current = [];
    indexRef.current = 0;
    clipStartRef.current = 0;
    startedAtRef.current = performance.now();
    setIndex(0);
    setPhase("running");
    void wakeLock.acquire();
  }

  /** Throw away what was said and typed, and go back to the start. */
  function startOver() {
    setConfirmRestart(false);
    speech.reset();
    setEdits({});
    setTyped({});
    setError(null);
    try {
      window.localStorage.removeItem(draftKey(lesson.id));
    } catch {
      // nothing to clean
    }
    // The server's copy too, or a reload would bring the old answers back.
    void fetch(`/api/lessons/${lesson.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ debriefTranscript: [] }),
    }).catch(() => {});
    setPhase("ready");
    // The microphone was let go at the end of the last take.
    void rec.arm();
  }

  async function save() {
    setSaving(true);
    setError(null);
    // Only well-formed lines go out: a page restored from the phone's memory
    // can carry one that is not, and that used to sink the whole save.
    const debriefTranscript = speech.segments
      .filter((seg) => Number.isFinite(seg.t) && typeof seg.text === "string")
      .map((seg) => ({ t: Math.max(0, seg.t), text: seg.text.slice(0, 4000), tag: seg.tag }));
    const debrief = answers.map((a) => ({ promptId: a.promptId, text: a.text.slice(0, 4000) }));
    let res: Response;
    try {
      res = await fetch(`/api/lessons/${lesson.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ debrief, debriefTranscript }),
      });
    } catch {
      setError(
        "Could not reach the server - probably the connection. Nothing is lost: it is kept on this phone. Try again when you have signal.",
      );
      setSaving(false);
      return;
    }
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setError(
        `The server did not accept it${body.error ? `: ${body.error}` : "."} Your answers are still here and on this phone.`,
      );
      setSaving(false);
      return;
    }
    try {
      window.localStorage.removeItem(draftKey(lesson.id));
    } catch {
      // nothing to clean
    }
    router.push(`/lesson/${lesson.id}/review`);
  }

  if (phase === "ready") {
    return (
      <div className="space-y-6">
        <ol className="space-y-2 card p-5 t-small">
          {PROMPTS.map((p, i) => (
            <li key={p.id} className="flex gap-3">
              <span className="shrink-0 font-mono t-caption t-muted">{i + 1}</span>
              <span>{p.label}</span>
            </li>
          ))}
        </ol>
        <div className="space-y-2">
          <LevelMeter level={rec.level} gateOpen />
          <p className="t-caption t-muted">
            Check the bar moves when you speak, then start. Take as long as you
            need on each prompt, and tap Next when you are done with it.
          </p>
        </div>
        {(rec.error || error) && (
          <p className="note note-warn">
            {rec.error ?? error} Or type the debrief instead.
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => begin()}
            disabled={rec.state === "idle"}
            className="btn btn-primary btn-lg"
          >
            {lesson.kind === "intro" ? "Start" : "Start debrief"}
          </button>
          <button onClick={() => setPhase("review")} className="btn btn-quiet btn-lg">
            Type it instead
          </button>
        </div>
      </div>
    );
  }

  if (phase === "running") {
    const prompt = PROMPTS[index];
    // This prompt's answer so far, piece by piece as it comes back.
    const heardNow = speech.segments
      .filter((seg) => seg.tag === prompt.id)
      .map((seg) => seg.text)
      .join(" ");
    return (
      <div className="stack-lg">
        <div className="card p-8 text-center">
          <p className="t-eyebrow">
            {index + 1} of {PROMPTS.length}
          </p>
          <p className="mt-3 t-title">
            {prompt.label}
          </p>
        </div>

        <div className="space-y-2">
          <LevelMeter level={rec.level} gateOpen />
          {/* The last answer as the server heard it: the honest sign that
              transcription works, which a moving bar is not. */}
          <p className="text-center t-small t-muted min-h-[2.5rem]">
            {speech.failed.length > 0
              ? `${speech.failed[speech.failed.length - 1].error} Keep talking - it can be retried at the end.`
              : heardNow
                ? `Heard: “${heardNow}”`
                : speech.pending.length > 0
                  ? "Transcribing…"
                  : "Recording - your words show up here as you pause."}
          </p>
        </div>

        {/* Say it, type it, or both: some answers are easier to paste in. */}
        <label className="block">
          <span className="label">Or type it here</span>
          <textarea
            value={typed[prompt.id] ?? ""}
            onChange={(e) => setTyped((prev) => ({ ...prev, [prompt.id]: e.target.value }))}
            rows={3}
            className="field"
            placeholder="Type or paste - it goes in with what you say."
          />
        </label>

        <div className="flex justify-center">
          {/* On the last prompt the same button finishes. */}
          <button onClick={() => advance()} className="btn btn-primary btn-lg">
            {index === PROMPTS.length - 1 ? "Finish" : "Next prompt"}
          </button>
        </div>
      </div>
    );
  }

  const transcribing = closing || speech.pending.length > 0;

  return (
    <div className="space-y-6">
      {transcribing && (
        <p className="note note-quiet">Transcribing what you said…</p>
      )}

      {speech.failed.length > 0 && !transcribing && (
        <div className="note note-warn space-y-2">
          <p>
            {speech.failed.length === 1 ? "One answer" : `${speech.failed.length} answers`} could
            not be transcribed: {speech.failed[0].error} The recording is still on this
            page - retry, or type the answer below.
          </p>
          <button onClick={() => speech.retry()} className="btn btn-quiet">
            Try again
          </button>
        </div>
      )}

      {!transcribing &&
        speech.failed.length === 0 &&
        speech.segments.length === 0 &&
        Object.keys(edits).length === 0 &&
        Object.keys(typed).length === 0 &&
        !unfinished && (
          <p className="note note-warn">
            Nothing was transcribed - no speech was heard. Type your answers below;
            they go into the summary all the same.
          </p>
        )}

      <p className="t-small t-muted">
        {unfinished && Object.keys(edits).length === 0
          ? "This debrief was interrupted. Here is what was saved - check it, fill any gaps, then save."
          : "Transcribed from what you said. Fix anything the recogniser got wrong - it goes straight into the summary."}
      </p>

      {PROMPTS.map((prompt, i) => (
        <label key={prompt.id} className="block">
          <span className="label">{prompt.label}</span>
          <textarea
            value={answers[i]?.text ?? ""}
            onChange={(e) =>
              setEdits((prev) => ({ ...prev, [prompt.id]: e.target.value }))
            }
            rows={3}
            className="field"
            placeholder={
              transcribing && speech.pending.includes(prompt.id) ? "Transcribing…" : undefined
            }
          />
        </label>
      ))}

      {error && <p className="note note-warn">{error}</p>}

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => void save()}
          // Saving now would drop the answers still on their way back.
          disabled={saving || transcribing}
          className="btn btn-primary btn-lg"
        >
          {saving
            ? "Saving..."
            : transcribing
              ? "Transcribing…"
              : lesson.kind === "intro"
                ? "Save note"
                : "Save debrief"}
        </button>
        <button
          onClick={() => setConfirmRestart(true)}
          disabled={saving || transcribing}
          className="btn btn-quiet btn-lg"
        >
          Record again
        </button>
      </div>

      <ConfirmDialog
        open={confirmRestart}
        title="Record it again?"
        body="What was transcribed and anything you typed here are thrown away, and you start again from the first question."
        confirmLabel="Record again"
        cancelLabel="Keep these answers"
        onConfirm={startOver}
        onCancel={() => setConfirmRestart(false)}
      />
    </div>
  );
}
