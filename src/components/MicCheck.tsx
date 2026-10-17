"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LevelMeter } from "@/components/LevelMeter";
import { useClipTranscriber } from "@/hooks/useClipTranscriber";
import { useTutorRecorder } from "@/hooks/useTutorRecorder";
import { LESSON_LANGUAGES, DEFAULT_LANGUAGE } from "@/lib/types";

type State = "pass" | "fail" | "warn" | "pending";

type Row = { label: string; state: State; detail: string };

/**
 * Everything the recording path depends on, checked in the order it would fail.
 * Static capability checks first, then the microphone, then a recording sent
 * to the server's recogniser - the last one is the only test that can tell you
 * whether a transcript will exist at all.
 */
export function MicCheck() {
  const [rows, setRows] = useState<Row[]>([]);
  const [language, setLanguage] = useState<string>(DEFAULT_LANGUAGE);
  const [listening, setListening] = useState(false);
  const [tested, setTested] = useState(false);
  /** Ends a test that runs on: the recogniser reads at most a minute. */
  const autoStopRef = useRef<number | undefined>(undefined);

  const rec = useTutorRecorder({ gate: { threshold: 0.012, holdMs: 700 } });
  const speech = useClipTranscriber(language);
  const peakRef = useRef(0);
  const [peak, setPeak] = useState(0);

  // Track the loudest input seen so the tutor can compare it to the gate
  // threshold afterwards, rather than guessing from a moving bar.
  useEffect(() => {
    if (rec.level > peakRef.current) peakRef.current = rec.level;
  }, [rec.level]);

  const check = useCallback(async () => {
    const out: Row[] = [];
    const add = (label: string, state: State, detail: string) =>
      out.push({ label, state, detail });

    // A page served over plain HTTP from anything but localhost cannot touch a
    // microphone at all. This is the single most common reason phone testing
    // fails, and the browser gives no visible error.
    const secure = window.isSecureContext;
    add(
      "Secure context",
      secure ? "pass" : "fail",
      secure
        ? location.protocol === "https:"
          ? "HTTPS"
          : "localhost counts as secure"
        : `${location.protocol}//${location.host} — microphone access is blocked. Use HTTPS or localhost.`,
    );

    const hasGum = Boolean(navigator.mediaDevices?.getUserMedia);
    add(
      "Microphone API",
      hasGum ? "pass" : "fail",
      hasGum ? "available" : "navigator.mediaDevices is missing",
    );

    const hasWorklet =
      typeof AudioContext !== "undefined" && "audioWorklet" in AudioContext.prototype;
    add(
      "AudioWorklet",
      hasWorklet ? "pass" : "fail",
      hasWorklet ? "available" : "the gate cannot run without it",
    );

    if (hasWorklet) {
      try {
        const ctx = new AudioContext();
        await ctx.audioWorklet.addModule("/tutor-gate-worklet.js");
        await ctx.close();
        add("Gate module", "pass", "loaded from /tutor-gate-worklet.js");
      } catch (e) {
        add(
          "Gate module",
          "fail",
          e instanceof Error ? e.message : "could not load",
        );
      }
    }

    if (typeof MediaRecorder !== "undefined") {
      const supported = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/mp4",
        "audio/ogg;codecs=opus",
      ].filter((t) => MediaRecorder.isTypeSupported(t));
      add(
        "Recorder",
        supported.length ? "pass" : "fail",
        supported.length ? supported[0] : "no supported audio format",
      );
    } else {
      add("Recorder", "fail", "MediaRecorder is missing");
    }

    const hasWake = "wakeLock" in navigator;
    add(
      "Screen wake lock",
      hasWake ? "pass" : "warn",
      hasWake
        ? "available"
        : "the screen may sleep mid-lesson; recording will pause",
    );

    setRows(out);
  }, []);

  const blocked = rows.some((r) => r.state === "fail");
  const ran = rows.length > 0;

  async function startMic() {
    await rec.arm();
    peakRef.current = 0;
    setPeak(0);
  }

  // Inside the tap, so the browser lets the audio run.
  function startListening() {
    speech.reset();
    setTested(false);
    peakRef.current = 0;
    if (rec.startClip()) {
      setListening(true);
      autoStopRef.current = window.setTimeout(() => void stopListening(), 55_000);
    }
  }

  async function stopListening() {
    window.clearTimeout(autoStopRef.current);
    setListening(false);
    setPeak(peakRef.current);
    const clip = await rec.endClip();
    if (clip) await speech.send(clip, 0);
    setTested(true);
  }

  const busy = speech.pending.length > 0;
  const failure = speech.failed[speech.failed.length - 1]?.error;

  return (
    <div className="stack-lg">
      {!ran && (
        <button onClick={() => void check()} className="btn btn-primary btn-lg">
          Run the check
        </button>
      )}

      {ran && (
      <section className="card rows">
        {rows.map((row) => (
          <div key={row.label} className="row">
            <span className="min-w-0">
              <span className="t-body block font-medium">{row.label}</span>
              <span className="t-small t-muted block">{row.detail}</span>
            </span>
            <Mark state={row.state} />
          </div>
        ))}
      </section>
      )}

      {blocked && (
        <p className="note note-warn">
          Something above failed. Recording will not work on this device until it
          is fixed — no point going further.
        </p>
      )}

      <section className="card card-pad stack-sm">
        <h2 className="t-title">Microphone</h2>

        {rec.state === "idle" ? (
          <button onClick={() => void startMic()} className="btn btn-primary">
            Test the microphone
          </button>
        ) : (
          <>
            <LevelMeter level={rec.level} threshold={0.012} gateOpen={rec.gateOpen} />
            <p className="t-small t-muted">
              Say something. The bar should move and turn green. If it never
              turns green, the gate would discard your voice in a real lesson.
            </p>
            {rec.devices.length > 0 && (
              <p className="t-small">
                <span className="t-muted">Using: </span>
                {rec.devices.find((d) => d.deviceId === rec.deviceId)?.label ??
                  "default microphone"}
              </p>
            )}
          </>
        )}

        {rec.error && <p className="note note-warn">{rec.error}</p>}
      </section>

      <section className="card card-pad stack-sm">
        <h2 className="t-title">Transcript</h2>
        <p className="t-small t-muted">
          This is the one that matters. Everything downstream reads the
          transcript, not the audio — if no words appear here, the lesson cannot
          be summarised.
        </p>

        <label className="block">
          <span className="label">Language</span>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            disabled={listening}
            className="field"
          >
            {LESSON_LANGUAGES.map((l) => (
              <option key={l.tag} value={l.tag}>
                {l.label}
              </option>
            ))}
          </select>
        </label>

        {rec.state === "idle" ? (
          <p className="t-small t-muted">Test the microphone above first.</p>
        ) : !listening ? (
          <button onClick={startListening} disabled={busy} className="btn btn-primary">
            {busy ? "Transcribing…" : "Record a sentence"}
          </button>
        ) : (
          <button onClick={() => void stopListening()} className="btn btn-quiet">
            Stop and transcribe
          </button>
        )}

        {listening && (
          <p className="t-small t-muted">
            Recording… say a full sentence in the language you selected, then stop.
          </p>
        )}

        {speech.segments.length > 0 && (
          <div className="card card-pad" style={{ background: "var(--sunken)" }}>
            <p className="t-eyebrow mb-2">Heard</p>
            {speech.segments.map((s, i) => (
              <p key={i} className="t-body">
                {s.text}
              </p>
            ))}
          </div>
        )}

        {failure && (
          <div className="card card-pad" style={{ borderColor: "var(--accent)" }}>
            <p className="t-subtitle">Transcription failed</p>
            <p className="t-body t-muted mt-2">{failure}</p>
            <p className="t-small mt-3">
              Without a transcript the lesson cannot be summarised, topics
              cannot be updated, and no parent note can be written.
            </p>
          </div>
        )}

        {tested && !busy && !failure && speech.segments.length === 0 && (
          <p className="note note-warn">
            No speech was heard. Check the bar above moves when you talk, and
            speak for a few seconds before stopping.
          </p>
        )}

        {!listening && !busy && !failure && speech.segments.length > 0 && (
          <p className="note note-accent">
            Transcript works. Peak input level was {peak.toFixed(3)} — the gate
            threshold is 0.012, so anything below that would be discarded.
          </p>
        )}
      </section>
    </div>
  );
}

function Mark({ state }: { state: State }) {
  const map: Record<State, { text: string; color: string }> = {
    pass: { text: "OK", color: "var(--live)" },
    warn: { text: "Warning", color: "var(--accent)" },
    fail: { text: "Failed", color: "var(--accent)" },
    pending: { text: "…", color: "var(--muted)" },
  };
  const { text, color } = map[state];
  return (
    <span className="t-caption shrink-0 font-medium" style={{ color }}>
      {text}
    </span>
  );
}
