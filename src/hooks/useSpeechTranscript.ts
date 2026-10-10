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
  const [segments, setSegmentsState] = useState<TranscriptSegment[]>([]);
  /** The same list, readable from callbacks without waiting for a render. */
  const segmentsRef = useRef<TranscriptSegment[]>([]);
  const setSegments = useCallback(
    (next: TranscriptSegment[] | ((prev: TranscriptSegment[]) => TranscriptSegment[])) => {
      const value = typeof next === "function" ? next(segmentsRef.current) : next;
      segmentsRef.current = value;
      setSegmentsState(value);
    },
    [],
  );
  /** Resolves a pending stopAndFlush once the recogniser has really ended. */
  const endedRef = useRef<(() => void) | null>(null);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);

  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const startedAtRef = useRef(0);
  const wantRef = useRef(false);
  /** Speech time accumulated before the current listening span. */
  const offsetRef = useRef(0);
  /** What the caller says is happening now, e.g. which prompt is on screen. */
  const tagRef = useRef<string | undefined>(undefined);
  /**
   * The tag captured when the current utterance started.
   *
   * A final result arrives whenever the recogniser decides it is done, which
   * on a continuous minute of speech can be all at once at the end. Attributing
   * by arrival puts everything in the last bucket, so an utterance is tagged by
   * when it *began* - the first interim text after a silence.
   */
  const utteranceTagRef = useRef<string | undefined>(undefined);

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
                tag: utteranceTagRef.current ?? tagRef.current,
              },
            ]);
          }
        } else {
          pending += alt.transcript;
        }
      }
      // An utterance starts the moment interim text appears after silence;
      // that is the moment whose context we want to remember.
      if (pending && utteranceTagRef.current === undefined) {
        utteranceTagRef.current = tagRef.current;
      } else if (!pending) {
        utteranceTagRef.current = undefined;
      }
      setInterim(pending);
    };

    rec.onerror = (e) => {
      // "no-speech" and "aborted" are routine during a quiet stretch.
      if (e.error === "no-speech" || e.error === "aborted") return;
      setError(explainSpeechError(e.error));
      // These do not fix themselves. Restarting on them just fails again in a
      // tight loop, so give up until the caller starts over.
      if (FATAL.has(e.error)) wantRef.current = false;
    };

    // Chrome ends the session on its own every so often; restart while wanted.
    rec.onend = () => {
      // A recogniser that has since been replaced (a quick pause and resume)
      // must not restart itself, or two run at once and every line doubles.
      if (recRef.current !== rec) return;
      if (wantRef.current) {
        try {
          rec.start();
          return;
        } catch {
          // fall through to stopped
        }
      }
      setListening(false);
      endedRef.current?.();
      endedRef.current = null;
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
  }, [lang, setSegments]);

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

  /**
   * Stop, and wait for the recogniser to hand over what it was still holding.
   * Chrome delivers the last final result after stop(), so reading the
   * segments straight away loses whatever was being said at that moment.
   */
  const stopAndFlush = useCallback(async (): Promise<TranscriptSegment[]> => {
    const running = wantRef.current && recRef.current;
    stop();
    if (running) {
      await new Promise<void>((resolve) => {
        endedRef.current = resolve;
        window.setTimeout(resolve, 1500);
      });
    }
    return segmentsRef.current;
  }, [stop]);

  /** Put back a transcript saved earlier, so a resumed lesson carries on. */
  const restore = useCallback(
    (saved: TranscriptSegment[]) => {
      setSegments(saved);
      offsetRef.current = saved.length ? saved[saved.length - 1].t + 1000 : 0;
    },
    [setSegments],
  );

  useEffect(() => () => {
    wantRef.current = false;
    recRef.current?.stop();
  }, []);

  /** Label what follows, so late-arriving text lands under the right prompt. */
  const setTag = useCallback((tag: string | undefined) => {
    tagRef.current = tag;
  }, []);

  return {
    supported,
    listening,
    segments,
    interim,
    error,
    start,
    resume,
    stop,
    stopAndFlush,
    restore,
    setTag,
    /** Current segments without waiting for a render - for autosave. */
    segmentsRef,
  };
}

/** Errors that will happen again if the recogniser is simply restarted. */
const FATAL = new Set([
  "not-allowed",
  "service-not-allowed",
  "audio-capture",
  "network",
  "language-not-supported",
  "bad-grammar",
]);
