"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { LevelMeter } from "@/components/LevelMeter";
import { MicPicker } from "@/components/MicPicker";
import { useSpeechTranscript } from "@/hooks/useSpeechTranscript";
import { useTutorRecorder } from "@/hooks/useTutorRecorder";
import { useWakeLock } from "@/hooks/useWakeLock";
import { INTERRUPTION_LABEL, type Lesson } from "@/lib/types";

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

  const gate = useMemo(
    () =>
      isClassroom || capturesStudent ? { threshold, holdMs: 700 } : null,
    [isClassroom, capturesStudent, threshold],
  );

  const speech = useSpeechTranscript(lesson.language);
  const rec = useTutorRecorder({
    gate,
    onAutoPause: () => speech.stop(),
    upload: { lessonId: lesson.id, kind: "lesson" },
  });
  const wakeLock = useWakeLock();

  // Ask for the mic as soon as the page opens so the meter is live.
  useEffect(() => {
    void rec.arm();
    // arm is stable enough for a one-shot on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const recording = rec.state === "recording";
  const paused = rec.state === "paused";
  const live = recording || paused;

  // Only run the recogniser where the student is a consenting participant.
  // It listens to the room, not to the gated stream, so in tutor-only mode it
  // would transcribe people who never agreed to be recorded.
  const transcribes = capturesStudent;

  async function begin() {
    // Taken before recording so a lock cannot land in the gap.
    await wakeLock.acquire();
    await fetch(`/api/lessons/${lesson.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ startedAt: new Date().toISOString() }),
    });
    if (transcribes) speech.start();
    await rec.start();
  }

  async function end() {
    setConfirmingEnd(false);
    speech.stop();
    setSaving(true);
    setSaveError(null);

    // The audio is already on the server; only the transcript and the timings
    // are still here. Waiting for the tail of the queue takes a moment, not
    // the minute a whole-file upload used to.
    const complete = await rec.stop();

    try {
      const res = await fetch(`/api/lessons/${lesson.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript: transcribes ? speech.segments : [],
          interruptions: rec.interruptions,
          endedAt: new Date().toISOString(),
          recordedMs: Math.round(rec.openMs),
        }),
      });
      if (!res.ok) throw new Error("Could not save the lesson.");
      void wakeLock.release();
      if (!complete) {
        setSaveError(
          "Some audio did not reach the server. The recording has gaps - check it before relying on it.",
        );
        setSaving(false);
        return;
      }
      router.push(`/lesson/${lesson.id}/debrief`);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Saving failed.");
      setSaving(false);
    }
  }

  function pause() {
    speech.stop();
    rec.pause();
  }

  async function resume() {
    // The lock is gone after the screen went off - take it again first.
    await wakeLock.acquire();
    await rec.resume();
    if (transcribes) speech.resume();
  }

  return (
    <div className="stack-lg">
      <p
        className={`rounded-md px-3 py-2 t-small ${
          capturesStudent
            ? "border border-accent bg-accent-soft"
            : "bg-surface text-muted"
        }`}
      >
        {capturesStudent
          ? "Recording both voices - yours and the student's."
          : "Recording your voice only. No transcript is taken, because the recogniser listens to the room rather than to the filtered signal."}
      </p>

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

      {live && (rec.pending > 2 || rec.uploadFailed) && (
        <p className={`note ${rec.uploadFailed ? "note-warn" : "note-quiet"}`}>
          {rec.uploadFailed
            ? "Some audio did not reach the server. The recording will have gaps."
            : `${rec.pending} seconds of audio waiting to upload — the connection is slow.`}
        </p>
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
            Audio after this point may be missing or ungated. Check the
            recording before relying on it.
          </p>
        </div>
      )}

      <section className="flex flex-wrap items-center gap-3">
        {!live ? (
          <button
            onClick={() => void begin()}
            disabled={rec.state === "idle" || saving}
            className="btn btn-primary btn-lg"
          >
            {saving ? "Saving..." : "Start lesson"}
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
              End lesson
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
        title="End the lesson?"
        body={`${formatMs(rec.elapsedMs)} recorded. This stops the recording and takes you to the debrief - it cannot be resumed afterwards.`}
        confirmLabel="End lesson"
        cancelLabel="Keep recording"
        onConfirm={() => void end()}
        onCancel={() => setConfirmingEnd(false)}
      />

      {saveError && <p className="note note-warn">{saveError}</p>}

      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="t-subtitle">
            {transcribes ? "Live transcript" : "Transcript"}
          </h2>
          <span className="t-caption t-muted">
            {speech.supported
              ? speech.listening
                ? "listening"
                : "idle"
              : "not supported in this browser - audio still records"}
          </span>
        </div>
        <div className="max-h-80 space-y-2 overflow-y-auto card p-4 t-small">
          {speech.segments.length === 0 && !speech.interim && (
            <p className="text-muted">
              Whatever you say during the lesson lands here. Students are not
              recorded.
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
          {speech.interim && <p className="text-muted">{speech.interim}</p>}
        </div>
        {speech.error && <p className="t-caption">{speech.error}</p>}
      </section>
    </div>
  );
}

function formatMs(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = String(Math.floor(total / 60)).padStart(2, "0");
  const s = String(total % 60).padStart(2, "0");
  return `${m}:${s}`;
}
