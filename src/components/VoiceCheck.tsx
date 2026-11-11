"use client";

import { useEffect, useRef, useState } from "react";
import { toSpeechWav } from "@/lib/wav";
import { VOICE_MAX_SECONDS, VOICE_PASS } from "@/lib/voice";
import type { Pronounced } from "@/lib/types";

/**
 * Pronunciation checks on a "say this line" task: asking first, recording,
 * and showing what the scoring service heard.
 *
 * The recording lives in this page's memory until it is sent, and on the
 * server only for the length of the request. Nothing is kept but the score.
 */

/** Where the learner stands on having their voice scored, this sitting. */
export type VoiceState = "ask" | "on" | "off";

export type VoiceProps = {
  state: VoiceState;
  lessonId: string;
  linkKey?: string;
  /** Saves the yes or no; resolves to an error message, or null. */
  setConsent: (agree: boolean) => Promise<string | null>;
  /** "Not now": the usual way for the rest of this sitting, nothing saved. */
  skip: () => void;
};

/** Asked once, before the first line is recorded. */
export function VoiceConsent({ voice }: { voice: VoiceProps }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function agree() {
    setBusy(true);
    setError(await voice.setConsent(true));
    setBusy(false);
  }

  return (
    <div className="game-line-say mt-4 space-y-2">
      <p className="game-title">Check my pronunciation?</p>
      <p className="game-hint">
        You record yourself saying the line, and you see how each word and
        sound came out.
      </p>
      <p className="game-hint">
        To score it, the recording is sent to SpeechSuper, a pronunciation
        service, on its servers in Hong Kong - outside mainland China. The
        recording is deleted straight after: aloudli never saves it. Your tutor
        sees the scores, not the recording. You can switch this off at any
        time.
      </p>
      {error && <p className="game-hint" role="alert">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button onClick={() => void agree()} disabled={busy} className="game-button">
          {busy ? "Saving…" : "Yes, check my pronunciation"}
        </button>
        <button onClick={voice.skip} disabled={busy} className="game-listen">
          Not now
        </button>
      </div>
    </div>
  );
}

type Phase = "idle" | "recording" | "checking";

/** Record one line and get it scored. */
export function VoiceRecorder({
  voice,
  kind,
  round,
  attempt,
  onScored,
}: {
  voice: VoiceProps;
  kind: string;
  round: number;
  /** 1 for the try that counts. */
  attempt: number;
  onScored: (result: Pronounced) => void;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const timers = useRef<number[]>([]);

  function clearTimers() {
    for (const id of timers.current) window.clearTimeout(id);
    timers.current = [];
  }

  // Leaving the screen mid-recording lets go of the microphone.
  useEffect(
    () => () => {
      clearTimers();
      const rec = recorder.current;
      recorder.current = null;
      if (rec && rec.state !== "inactive") rec.stop();
      rec?.stream.getTracks().forEach((t) => t.stop());
    },
    [],
  );

  async function start() {
    setError(null);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
    } catch {
      setError("The microphone is blocked. Allow it for this site and try again.");
      return;
    }
    const rec = new MediaRecorder(stream);
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      // Unmounted: nobody is waiting for a score.
      if (recorder.current !== rec) return;
      recorder.current = null;
      void send(new Blob(chunks, { type: rec.mimeType }));
    };
    recorder.current = rec;
    rec.start();
    setSeconds(0);
    setPhase("recording");
    timers.current.push(
      window.setInterval(() => setSeconds((n) => n + 1), 1000),
      // A line is a few seconds; this is someone who forgot to stop.
      window.setTimeout(stop, (VOICE_MAX_SECONDS - 1) * 1000),
    );
  }

  function stop() {
    clearTimers();
    const rec = recorder.current;
    if (rec && rec.state === "recording") {
      setPhase("checking");
      rec.stop();
    }
  }

  async function send(clip: Blob) {
    const wav = await toSpeechWav(clip).catch(() => null);
    if (!wav) {
      setPhase("idle");
      setError("Nothing was heard - tap Record and say the line.");
      return;
    }
    const query = new URLSearchParams({ kind, round: String(round), attempt: String(attempt) });
    if (voice.linkKey) query.set("key", voice.linkKey);
    try {
      const res = await fetch(`/api/lessons/${voice.lessonId}/homework/voice?${query}`, {
        method: "POST",
        headers: { "Content-Type": "audio/wav" },
        body: wav,
        signal: AbortSignal.timeout(45_000),
      });
      const body = (await res.json().catch(() => null)) as (Pronounced & { error?: string }) | null;
      if (!res.ok || !body) {
        setPhase("idle");
        setError(body?.error ?? "The check failed. Try again.");
        return;
      }
      setPhase("idle");
      onScored(body);
    } catch {
      setPhase("idle");
      setError("Could not reach the server - check the connection and try again.");
    }
  }

  return (
    <div className="mt-4 space-y-2">
      {phase === "recording" ? (
        <button onClick={stop} className="game-button game-recording">
          Stop · {seconds}s
        </button>
      ) : (
        <button onClick={() => void start()} disabled={phase === "checking"} className="game-button">
          {phase === "checking" ? "Checking…" : attempt > 1 ? "Record again" : "Record"}
        </button>
      )}
      {phase === "idle" && !error && (
        <p className="game-hint">Tap Record, say the line, then tap Stop.</p>
      )}
      {error && (
        <p className="game-hint" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/** What the service heard: every word marked, the worst explained. */
export function VoiceResult({ result }: { result: Pronounced }) {
  const weak = result.words
    .filter((w) => w.missed || w.score < VOICE_PASS)
    .sort((a, b) => a.score - b.score)
    .slice(0, 3);

  return (
    <div className="game-line-say mt-3">
      <p className="game-small">Pronunciation</p>
      <p className="game-voice-score">{result.overall}/100</p>
      <p className="game-sentence mt-1">
        {result.words.map((w, i) => (
          <span
            key={i}
            className={w.missed ? "voice-missed" : w.score < VOICE_PASS ? "voice-weak" : undefined}
          >
            {w.word}{" "}
          </span>
        ))}
      </p>
      {weak.length > 0 && (
        <ul className="game-hint mt-2 space-y-1">
          {weak.map((w, i) => (
            <li key={i}>{advice(w)}</li>
          ))}
        </ul>
      )}
      <p className="game-small mt-2">
        Sounds {result.pronunciation} · Flow {result.fluency} · Rhythm {result.rhythm}
      </p>
    </div>
  );
}

function advice(w: Pronounced["words"][number]): string {
  const word = w.word.replace(/[^\p{L}\p{N}'-]/gu, "");
  if (w.missed) return `"${word}" - not heard. Say every word, even the small ones.`;
  const swap = w.sounds?.find((s) => s.heard);
  if (swap) return `"${word}" - the /${swap.sound}/ sound came out more like /${swap.heard}/.`;
  const sound = w.sounds?.[0];
  if (sound) return `"${word}" - the /${sound.sound}/ sound needs more care.`;
  return `"${word}" - listen again and copy it slowly.`;
}
