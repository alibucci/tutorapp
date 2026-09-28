"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { TranscriptSegment } from "@/lib/types";

// The Web Speech API is not in lib.dom, so declare the slice we use.
type SpeechAlternative = { transcript: string; confidence: number };
type SpeechResult = {
  isFinal: boolean;
  length: number;
  [index: number]: SpeechAlternative;
};
type SpeechEvent = {
  resultIndex: number;
  results: { length: number; [index: number]: SpeechResult };
};
type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: SpeechEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/**
 * Live transcript of the tutor's speech, from the browser's own recogniser.
 *
 * Zero setup, but the engine behind it differs by browser and that matters:
 * Chrome and Edge send audio to Google, Safari sends it to Apple, and other
 * Chromium builds have neither and fail outright. Where Google is unreachable,
 * Safari is the one that keeps working.
 *
 * For a deployment that must keep audio on the device regardless, swap this for
 * a local model or a self-hosted endpoint - nothing downstream cares where the
 * segments come from.
 */
const subscribeNever = () => () => {};

/**
 * What the recogniser's error codes actually mean for this app.
 *
 * The raw codes are one word each and read like transcript output when shown to
 * a person, which is worse than useless - `network` in particular looks like a
 * transcribed word.
 */
export function explainSpeechError(code: string): string {
  switch (code) {
    case "network":
      return "The recogniser could not reach its server. Chrome sends audio to Google to transcribe it, and this fails for two very different reasons: a Chromium-based browser built without Google's speech keys (Brave, Arc, Vivaldi, plain Chromium) never works at all, while real Chrome fails only when Google is unreachable. Try genuine Google Chrome before concluding the network is at fault.";
    case "not-allowed":
    case "service-not-allowed":
      return "The browser refused microphone access for speech recognition. Check the site permissions, and note that some managed browsers disable it outright.";
    case "audio-capture":
      return "No microphone was available to the recogniser.";
    case "language-not-supported":
      return "This browser cannot recognise the selected language. Try another, or use a different speech engine.";
    case "bad-grammar":
      return "The recogniser rejected its configuration.";
    default:
      return `Speech recognition stopped: ${code}.`;
  }
}

export function useSpeechTranscript(lang = "en-US") {
  const [listening, setListening] = useState(false);
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);

  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const startedAtRef = useRef(0);
  const wantRef = useRef(false);
  /** Speech time accumulated before the current listening span. */
  const offsetRef = useRef(0);

  // Read once on the client; false on the server so hydration matches.
  const supported = useSyncExternalStore(
    subscribeNever,
    () => getRecognitionCtor() !== null,
    () => false,
  );

  const listen = useCallback((fresh: boolean) => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) {
      setError("This browser has no speech recognition. Audio still records.");
      return;
    }
    const rec = new Ctor();
    rec.lang = lang;
    rec.continuous = true;
    rec.interimResults = true;

    rec.onresult = (e) => {
      let pending = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        const alt = result[0];
        if (!alt) continue;
        if (result.isFinal) {
          const text = alt.transcript.trim();
          if (text) {
            setSegments((prev) => [
              ...prev,
              {
                t: Math.round(
                  offsetRef.current + (performance.now() - startedAtRef.current),
                ),
                text,
                confidence: alt.confidence,
              },
            ]);
          }
        } else {
          pending += alt.transcript;
        }
      }
      setInterim(pending);
    };

    rec.onerror = (e) => {
      // "no-speech" and "aborted" are routine during a quiet stretch.
      if (e.error !== "no-speech" && e.error !== "aborted") {
        setError(explainSpeechError(e.error));
      }
    };

    // Chrome ends the session on its own every so often; restart while wanted.
    rec.onend = () => {
      if (wantRef.current) {
        try {
          rec.start();
        } catch {
          setListening(false);
        }
      } else {
        setListening(false);
      }
    };

    startedAtRef.current = performance.now();
    wantRef.current = true;
    recRef.current = rec;
    if (fresh) {
      offsetRef.current = 0;
      setSegments([]);
    }
    setInterim("");
    setError(null);
    try {
      rec.start();
      setListening(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start recognition.");
    }
  }, [lang]);

  /** Begin a new transcript, discarding anything already captured. */
  const start = useCallback(() => listen(true), [listen]);

  /** Carry on after a pause, keeping the segments captured so far. */
  const resume = useCallback(() => listen(false), [listen]);

  const stop = useCallback(() => {
    if (wantRef.current) {
      offsetRef.current += performance.now() - startedAtRef.current;
    }
    wantRef.current = false;
    recRef.current?.stop();
    setListening(false);
    setInterim("");
  }, []);

  useEffect(() => () => {
    wantRef.current = false;
    recRef.current?.stop();
  }, []);

  return { supported, listening, segments, interim, error, start, resume, stop };
}
