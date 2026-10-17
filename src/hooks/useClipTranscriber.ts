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
  const [failed, setFailed] = useState<Failed[]>([]);

  const send = useCallback(
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
    [language, setSegments],
  );

  /** Try every failed clip again. */
  const retry = useCallback(() => {
    const again = failed;
    setFailed([]);
    for (const f of again) void send(f.clip, f.t, f.tag);
  }, [failed, send]);

  /** Put back a transcript saved earlier. */
  const restore = useCallback(
    (saved: TranscriptSegment[]) => setSegments(saved),
    [setSegments],
  );

  const reset = useCallback(() => {
    setSegments([]);
    setFailed([]);
  }, [setSegments]);

  return {
    segments,
    segmentsRef,
    pending,
    failed,
    send,
    retry,
    restore,
    reset,
  };
}
