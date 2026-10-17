"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { LevelMeter } from "@/components/LevelMeter";
import { MicPicker } from "@/components/MicPicker";
import { useClipTranscriber } from "@/hooks/useClipTranscriber";
import { useTutorRecorder } from "@/hooks/useTutorRecorder";
import { useWakeLock } from "@/hooks/useWakeLock";
import { INTERRUPTION_LABEL, type Lesson, type TranscriptSegment } from "@/lib/types";

/** How often a running lesson's transcript is copied to the server. */
const AUTOSAVE_MS = 10_000;

/**
 * The lesson goes to the recogniser in pieces. A piece ends at the first pause
 * in speech once it is MIN long, so a word is not cut in half, and at MAX
 * whatever is happening, so text never lags far behind the room.
 */
const MIN_CLIP_MS = 8_000;
const MAX_CLIP_MS = 25_000;

function draftKey(id: string) {
  return `tutor-signal:lesson:${id}`;
}

/** The copy kept on the device, for when the network is what failed. */
function readDraft(id: string): TranscriptSegment[] {
  try {
    const raw = window.localStorage.getItem(draftKey(id));
    return raw ? (JSON.parse(raw) as TranscriptSegment[]) : [];
  } catch {
    return [];
  }
}

export function LessonRecorder({ lesson }: { lesson: Lesson }) {
  const router = useRouter();
  const isClassroom = lesson.mode === "classroom";

  const capturesStudent = lesson.capture === "both";

  // With both voices on one mic the gate is only a noise floor: the student sits
  // further from it than the tutor does, and must not be gated out.
  const [threshold, setThreshold] = useState(capturesStudent ? 0.012 : 0.04);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirmingEnd, setConfirmingEnd] = useState(false);
  const [confirmingRestart, setConfirmingRestart] = useState(false);
  /** Finish was pressed and the last pieces are still being transcribed. */
  const [finishing, setFinishing] = useState(false);
  /** The end-of-lesson save failed; the transcript is still here to retry. */
  const [unsaved, setUnsaved] = useState(false);
  /**
   * Started earlier and never ended: the tab closed, the phone died, or the
   * browser threw it away in the background. Offer to carry on rather than
   * start over.
   */
  const [interrupted, setInterrupted] = useState(
    Boolean(lesson.startedAt && !lesson.endedAt),
  );

  const gate = useMemo(
    () =>
      isClassroom || capturesStudent ? { threshold, holdMs: 700 } : null,
    [isClassroom, capturesStudent, threshold],
  );

  /** Time from before an interruption, so a carried-on lesson stays in order. */
  const baseRef = useRef(0);
  const speech = useClipTranscriber(lesson.language);
  const rec = useTutorRecorder({
    gate,
    // The screen went off: what was said up to now goes off to be read.
    onAutoPause: () => void clipsRef.current.cut(),
  });
  const wakeLock = useWakeLock();

  // Ask for the mic as soon as the page opens so the meter is live, and put
  // back whatever an interrupted run already captured - the server's copy or
  // the device's, whichever got further.
  useEffect(() => {
    void rec.arm();
    if (interrupted) {
      const local = readDraft(lesson.id);
      const saved = local.length > lesson.transcript.length ? local : lesson.transcript;
      speech.restore(saved);
      // Carrying on starts the clock at zero again; this keeps new lines after
      // the old ones.
      baseRef.current = saved.length ? saved[saved.length - 1].t + 1000 : 0;
    }
    // one-shot on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const recording = rec.state === "recording";
  const paused = rec.state === "paused";
  const live = recording || paused;

  // Only transcribe where the student is a consenting participant. The gate
  // cuts by loudness, not by who is speaking, so in tutor-only mode a
  // transcript could still hold the words of a child nobody agreed to record.
  const transcribes = capturesStudent;

  // --- the lesson, in pieces, to the recogniser ----------------------------

  const elapsedRef = useRef(0);
  const gateOpenRef = useRef(true);
  /** Whether the gate opened at all during the piece now recording. */
  const heardRef = useRef(false);
  useEffect(() => {
    elapsedRef.current = rec.elapsedMs;
    gateOpenRef.current = rec.gateOpen;
    if (rec.gateOpen) heardRef.current = true;
  }, [rec.elapsedMs, rec.gateOpen]);
  const lessonMs = () => baseRef.current + elapsedRef.current;

  /** Lesson time where the piece now recording began; null when none is. */
  const clipStartRef = useRef<number | null>(null);

  function openClip() {
    if (!transcribes || clipStartRef.current !== null) return;
    if (rec.startClip()) {
      clipStartRef.current = lessonMs();
      heardRef.current = gateOpenRef.current;
    }
  }

  /** End the piece now recording and send it. Resolves once it is sent off. */
  function cutClip(): Promise<void> {
    const t = clipStartRef.current;
    if (t === null) return Promise.resolve();
    clipStartRef.current = null;
    // A piece the gate never opened for is room noise or silence: there is
    // nothing in it to read, and sending it would only be paid for.
    const heard = heardRef.current;
    return rec.endClip().then((clip) => {
      if (clip && heard) void speech.send(clip, t);
    });
  }

  // The interval and the auto-pause outlive any one render; they call through
  // this, as the autosave below does.
  const clipsRef = useRef({ open: openClip, cut: cutClip });
  useEffect(() => {
    clipsRef.current = { open: openClip, cut: cutClip };
  });

  useEffect(() => {
    if (!recording || !transcribes) return;
    const id = window.setInterval(() => {
      const start = clipStartRef.current;
      if (start === null) return;
      const length = lessonMs() - start;
      // The gate closing is a pause in speech: a clean place to cut.
      if (length >= MAX_CLIP_MS || (length >= MIN_CLIP_MS && !gateOpenRef.current)) {
        void clipsRef.current.cut();
        clipsRef.current.open();
      }
    }, 200);
    return () => window.clearInterval(id);
  }, [recording, transcribes]);

  // --- keeping a running lesson safe ---------------------------------------

  const savedCountRef = useRef(lesson.transcript.length);
  const live_ = rec.state === "recording" || rec.state === "paused";

  /** Copy progress to the server. `keepalive` lets it finish as the page dies. */
  function saveProgress(keepalive = false) {
      const transcript = speech.segmentsRef.current;
      if (transcribes && transcript.length === savedCountRef.current) return;
      savedCountRef.current = transcript.length;
      void fetch(`/api/lessons/${lesson.id}`, {
        method: "PATCH",
        keepalive,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(transcribes && { transcript }),
          interruptions: rec.interruptions,
          recordedMs: Math.round(rec.openMs),
        }),
      }).catch(() => {
        // Try again on the next tick rather than losing it.
        savedCountRef.current = -1;
      });
  }
  const saveRef = useRef(saveProgress);
  useEffect(() => {
    saveRef.current = saveProgress;
  });

  useEffect(() => {
    if (!live_) return;
    const timer = window.setInterval(() => saveRef.current(), AUTOSAVE_MS);
    // The moment the app is hidden is the last moment we are sure to run.
    const onHide = () => {
      if (document.visibilityState === "hidden") saveRef.current(true);
    };
    const onPageHide = () => saveRef.current(true);
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [live_]);

  // And a copy on the device, every time a line lands.
  useEffect(() => {
    if (!transcribes || speech.segments.length === 0) return;
    try {
      window.localStorage.setItem(draftKey(lesson.id), JSON.stringify(speech.segments));
    } catch {
      // Private mode or full storage: the server copy still runs.
    }
  }, [transcribes, speech.segments, lesson.id]);

  async function begin() {
    // Taken before recording so a lock cannot land in the gap.
    await wakeLock.acquire();
    if (!lesson.startedAt) {
      await fetch(`/api/lessons/${lesson.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startedAt: new Date().toISOString() }),
      }).catch(() => {});
    }
    setInterrupted(false);
    await rec.start();
    openClip();
  }

  /** Save the end of the lesson. Safe to call again if it failed. */
  async function finishSave(transcript: TranscriptSegment[]) {
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(`/api/lessons/${lesson.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(transcribes && { transcript }),
          interruptions: rec.interruptions,
          endedAt: new Date().toISOString(),
          ...(rec.openMs > 0 && { recordedMs: Math.round(rec.openMs) }),
        }),
      });
      if (!res.ok) throw new Error("Could not save the lesson.");
      try {
        window.localStorage.removeItem(draftKey(lesson.id));
      } catch {
        // nothing to clean
      }
      setUnsaved(false);
      void wakeLock.release();
      router.push(`/lesson/${lesson.id}/debrief`);
    } catch {
      setUnsaved(true);
      setSaveError(
        "Could not save the end of the lesson - probably the connection. Nothing is lost: try again when you have signal.",
      );
      setSaving(false);
    }
  }

  async function end() {
    setConfirmingEnd(false);
    setFinishing(true);
    // The last piece, then every piece still out, before anything is saved.
    await cutClip();
    // Audio is never kept, so only the transcript and the timings are saved.
    rec.stop();
    const transcript = await speech.settle();
    setFinishing(false);
    // Leaving now would lose what failed - it exists only on this page.
    if (speech.failedRef.current.length) return;
    await finishSave(transcript);
  }

  /** After a failed piece: try it again, then finish once all are back. */
  async function retryAndFinish() {
    setFinishing(true);
    speech.retry();
    const transcript = await speech.settle();
    setFinishing(false);
    if (speech.failedRef.current.length) return;
    await finishSave(transcript);
  }

  /**
   * Throw the take away and go back to before Start: transcript, timings and
   * interruptions, here and on the server. The lesson record itself stays.
   */
  async function startOver() {
    setConfirmingRestart(false);
    // The piece now recording is thrown away, not sent.
    clipStartRef.current = null;
    void rec.endClip();
    rec.stop();
    void wakeLock.release();
    speech.reset();
    baseRef.current = 0;
    savedCountRef.current = 0;
    try {
      window.localStorage.removeItem(draftKey(lesson.id));
    } catch {
      // nothing to clean
    }
    await fetch(`/api/lessons/${lesson.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(transcribes && { transcript: [] }),
        interruptions: [],
        recordedMs: 0,
      }),
    }).catch(() => {});
    setInterrupted(false);
    // A stopped recorder cannot start again; a fresh one is built here.
    await rec.arm(rec.deviceId || undefined);
  }

  function pause() {
    void cutClip();
    rec.pause();
  }

  async function resume() {
    // The screen lock is gone after the screen went off.
    await wakeLock.acquire();
    await rec.resume();
    openClip();
  }

  return (
    <div className="stack-lg">
      <p className={`note ${capturesStudent ? "note-accent" : "note-quiet"}`}>
        {capturesStudent
          ? "Both voices, with a live transcript. The parent has consented."
          : "Your voice only, and no live transcript - without the parent's consent the transcript could pick up the student. Your debrief straight after the lesson is what the summary is built from."}
      </p>

      {interrupted && (
        <section className="card card-pad space-y-3 border-warn">
          <p className="t-subtitle">This lesson was interrupted</p>
          <p className="t-small t-muted">
            It started{" "}
            {lesson.startedAt && new Date(lesson.startedAt).toLocaleTimeString()} and
            was never ended - the page closed or the phone went off.
            {transcribes &&
              ` ${speech.segments.length} lines of transcript were saved and are kept.`}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => void begin()}
              disabled={rec.state === "idle"}
              className="btn btn-primary"
            >
              Continue recording
            </button>
            <button
              onClick={() => void finishSave(speech.segmentsRef.current)}
              disabled={saving}
              className="btn btn-quiet"
            >
              End it and record the debrief
            </button>
            <button onClick={() => setConfirmingRestart(true)} className="btn btn-quiet">
              Start over
            </button>
          </div>
        </section>
      )}

      <section className="space-y-4 card p-5">
        <MicPicker
          devices={rec.devices}
          value={rec.deviceId}
          onChange={(id) => void rec.arm(id)}
          disabled={live}
        />

        <div className="space-y-2">
          <div className="flex items-baseline justify-between t-small">
            <span className="font-medium">Input level</span>
            <span className="t-caption t-muted">
              {isClassroom
                ? rec.gateOpen
                  ? "gate open - writing audio"
                  : "gate closed - room audio discarded"
                : "recording your mic only"}
            </span>
          </div>
          <LevelMeter
            level={rec.level}
            threshold={gate ? threshold : null}
            gateOpen={rec.gateOpen}
          />
        </div>

        {gate && (
          <label className="block">
            <span className="label">
              Gate threshold
            </span>
            <input
              type="range"
              min={0.005}
              max={0.15}
              step={0.005}
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
              className="w-full accent-[var(--accent)]"
            />
            <span className="hint">
              {capturesStudent
                ? "Keep this low - it only cuts room noise. Both of you must stay above the line."
                : "Speak normally and raise this until the bar only turns green for you. Below the line, nothing is written to disk or sent anywhere."}
            </span>
          </label>
        )}

        {rec.error && <p className="note note-warn">{rec.error}</p>}
      </section>

      {live && (
        <p
          className={`enter note ${wakeLock.active ? "note-accent" : "note-warn"}`}
        >
          {wakeLock.active
            ? "Screen is being held awake for this lesson."
            : wakeLock.supported
              ? "The screen is NOT being held awake. If it turns off, recording pauses."
              : "This browser cannot hold the screen awake. If the screen turns off, recording pauses."}
        </p>
      )}

      {rec.autoPaused === "screen-off" && (
        <div className="enter card card-accent card-pad">
          <p className="t-subtitle">
            Recording paused - the screen went off.
          </p>
          <p className="t-caption t-muted mt-1">
            Everything up to this point is kept. Tap continue to carry on.
          </p>
          <button
            onClick={() => void resume()}
            className="mt-3 btn btn-primary"
          >
            Continue recording
          </button>
        </div>
      )}

      {rec.interruptions.length > 0 && (
        <div className="enter card card-accent card-pad t-small">
          <p className="font-medium">This recording was interrupted.</p>
          <ul className="mt-1.5 space-y-0.5 t-caption">
            {rec.interruptions.map((i, n) => (
              <li key={n}>
                {new Date(i.at).toLocaleTimeString()} &mdash;{" "}
                {INTERRUPTION_LABEL[i.kind]}
              </li>
            ))}
          </ul>
          <p className="mt-2 t-caption">
            The transcript after this point may be missing. Check it before
            relying on the summary.
          </p>
        </div>
      )}

      <section className="flex flex-wrap items-center gap-3">
        {unsaved ? (
          <button
            onClick={() => void finishSave(speech.segmentsRef.current)}
            disabled={saving}
            className="btn btn-primary btn-lg"
          >
            {saving ? "Saving…" : "Try saving again"}
          </button>
        ) : interrupted ? null : !live ? (
          <button
            onClick={() => void begin()}
            disabled={rec.state === "idle" || saving}
            className="btn btn-primary btn-lg"
          >
            {saving ? "Saving…" : "Start lesson"}
          </button>
        ) : (
          <>
            {recording ? (
              <button
                onClick={pause}
                className="btn btn-quiet btn-lg"
              >
                Pause
              </button>
            ) : (
              <button
                onClick={() => void resume()}
                className="btn btn-primary btn-lg"
              >
                Continue
              </button>
            )}
            <button
              onClick={() => setConfirmingEnd(true)}
              className="btn btn-quiet btn-lg"
            >
              Finish &amp; review
            </button>
            <button
              onClick={() => setConfirmingRestart(true)}
              className="btn btn-quiet btn-lg"
            >
              Start over
            </button>
          </>
        )}

        <span className="font-mono t-num t-small t-muted">
          {formatMs(rec.elapsedMs)}
          {gate && ` (${formatMs(rec.openMs)} captured)`}
          {paused && " · paused"}
        </span>
      </section>

      <ConfirmDialog
        open={confirmingEnd}
        title="Finish the lesson?"
        body={`${formatMs(rec.elapsedMs)} recorded. This stops the recording and takes you to the debrief - it cannot be resumed afterwards.`}
        confirmLabel="Finish & review"
        cancelLabel="Keep recording"
        onConfirm={() => void end()}
        onCancel={() => setConfirmingEnd(false)}
      />

      <ConfirmDialog
        open={confirmingRestart}
        title="Are you sure you want to start over?"
        body={
          transcribes
            ? "The recording stops, and the transcript so far is deleted - on this device and on the server. You start again from zero. This cannot be undone."
            : "The recording stops and its timings are deleted. You start again from zero. This cannot be undone."
        }
        confirmLabel="Start over"
        cancelLabel="Keep recording"
        onConfirm={() => void startOver()}
        onCancel={() => setConfirmingRestart(false)}
      />

      {saveError && <p className="note note-warn">{saveError}</p>}

      {finishing && (
        <p className="note note-quiet">Transcribing the last part of the lesson…</p>
      )}

      {!finishing && !live && speech.failed.length > 0 && (
        <div className="note note-warn space-y-2">
          <p>
            {speech.failed.length === 1 ? "One part" : `${speech.failed.length} parts`} of the
            lesson could not be transcribed: {speech.failed[0].error} The audio is still on
            this page, but only until you leave it.
          </p>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => void retryAndFinish()} className="btn btn-primary">
              Try again
            </button>
            <button
              onClick={() => void finishSave(speech.segmentsRef.current)}
              disabled={saving}
              className="btn btn-quiet"
            >
              Finish without them
            </button>
          </div>
        </div>
      )}

      {transcribes && (
      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="t-subtitle">Live transcript</h2>
          <span className="t-caption t-muted">
            {speech.pending.length > 0
              ? "transcribing…"
              : recording
                ? "listening"
                : "idle"}
          </span>
        </div>
        <div className="max-h-80 space-y-2 overflow-y-auto card p-4 t-small">
          {speech.segments.length === 0 && (
            <p className="text-muted">
              Both voices land here a few seconds after they are said. It is
              saved as you go.
            </p>
          )}
          {speech.segments.map((s, i) => (
            <p key={i}>
              <span className="mr-2 font-mono t-caption t-muted">
                {formatMs(s.t)}
              </span>
              {s.text}
            </p>
          ))}
        </div>
        {live && speech.failed.length > 0 && (
          <p className="t-caption">
            {speech.failed.length} {speech.failed.length === 1 ? "part" : "parts"} could not be
            transcribed yet - you can retry when you finish.
          </p>
        )}
      </section>
      )}
    </div>
  );
}

function formatMs(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = String(Math.floor(total / 60)).padStart(2, "0");
  const s = String(total % 60).padStart(2, "0");
  return `${m}:${s}`;
}
