"use client";

import { useCallback, useRef, useState } from "react";
import { toSpeechWav } from "@/lib/wav";
import type { TranscriptSegment } from "@/lib/types";

type Failed = { tag?: string; t: number; clip: Blob; error: string };

/**
 * A transcript built from recorded clips, each sent to the server's recogniser.
 *
 * Replaces the browser's own recogniser for short recordings, so the result no
 * longer depends on which browser the tutor happens to use. There is no live
 * text while someone speaks: each clip comes back a second or two after it
 * ends.
 *
 * A clip that fails to transcribe is kept in memory, not dropped, so the tutor
 * can retry it once the connection is back. Nothing is stored anywhere else.
 */
export function useClipTranscriber(language: string) {
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
  /** Tags of clips still on their way back. */
  const [pending, setPending] = useState<(string | undefined)[]>([]);
  const [failed, setFailedState] = useState<Failed[]>([]);
  /** The same list, readable straight after `settle` without a render. */
  const failedRef = useRef<Failed[]>([]);
  const setFailed = useCallback((next: Failed[] | ((prev: Failed[]) => Failed[])) => {
    const value = typeof next === "function" ? next(failedRef.current) : next;
    failedRef.current = value;
    setFailedState(value);
  }, []);
  /** Requests still out, so a caller can wait for every one to come back. */
  const inFlightRef = useRef(new Set<Promise<void>>());

  const sendOne = useCallback(
    async (clip: Blob, t: number, tag?: string) => {
      setPending((p) => [...p, tag]);
      try {
        const wav = await toSpeechWav(clip);
        if (!wav) return;
        const res = await fetch(`/api/transcribe?lang=${encodeURIComponent(language)}`, {
          method: "POST",
          headers: { "Content-Type": "audio/wav" },
          body: wav,
        });
        const body = (await res.json().catch(() => ({}))) as { text?: string; error?: string };
        if (!res.ok) throw new Error(body.error ?? `Transcription failed (${res.status}).`);
        const text = (body.text ?? "").trim();
        if (!text) return;
        setSegments((prev) =>
          // Clips can come back out of order; keep the transcript in time order.
          [...prev, { t, text, tag }].sort((a, b) => a.t - b.t),
        );
      } catch (e) {
        const error =
          e instanceof TypeError
            ? "Could not reach the server - probably the connection."
            : e instanceof Error
              ? e.message
              : "Transcription failed.";
        setFailed((f) => [...f, { tag, t, clip, error }]);
      } finally {
        setPending((p) => {
          const i = p.indexOf(tag);
          return i < 0 ? p : [...p.slice(0, i), ...p.slice(i + 1)];
        });
      }
    },
    [language, setSegments, setFailed],
  );

  const send = useCallback(
    (clip: Blob, t: number, tag?: string): Promise<void> => {
      const job = sendOne(clip, t, tag);
      inFlightRef.current.add(job);
      void job.finally(() => inFlightRef.current.delete(job));
      return job;
    },
    [sendOne],
  );

  /**
   * Wait for every clip already sent, then hand back the transcript. What
   * failed is in `failed`, not here - the caller decides whether to retry.
   */
  const settle = useCallback(async (): Promise<TranscriptSegment[]> => {
    while (inFlightRef.current.size) await Promise.all([...inFlightRef.current]);
    return segmentsRef.current;
  }, []);

  /** Try every failed clip again. */
  const retry = useCallback(() => {
    const again = failedRef.current;
    setFailed([]);
    for (const f of again) void send(f.clip, f.t, f.tag);
  }, [send, setFailed]);

  /** Put back a transcript saved earlier. */
  const restore = useCallback(
    (saved: TranscriptSegment[]) => setSegments(saved),
    [setSegments],
  );

  const reset = useCallback(() => {
    setSegments([]);
    setFailed([]);
  }, [setSegments, setFailed]);

  return {
    segments,
    segmentsRef,
    pending,
    failed,
    failedRef,
    send,
    settle,
    retry,
    restore,
    reset,
  };
}
