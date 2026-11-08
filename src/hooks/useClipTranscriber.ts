"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toSpeechWav } from "@/lib/wav";
import type { TranscriptSegment } from "@/lib/types";

type Failed = { tag?: string; t: number; clip: Blob; error: string; tries: number };

/** One upload, at most. A slow phone moves a piece in well under this. */
const UPLOAD_MS = 90_000;
/** One piece, start to finish, whatever happens: then it counts as failed. */
const PIECE_MS = 4 * 60_000;
/** Goes per piece before it waits for the next automatic round. */
const ATTEMPTS = 3;
/** Pieces on the wire at once. More only fight over a thin connection. */
const AT_ONCE = 2;
/** While recording, failed pieces are tried again this often... */
const RETRY_EVERY_MS = 30_000;
/** ...this many times each, before only the tutor's "Try again" sends them. */
const AUTO_ROUNDS = 6;

class ServerSaid extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly wantsWav = false,
  ) {
    super(message);
  }
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

/** The promise, or an error once `ms` has passed - so nothing waits forever. */
function within<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer = 0;
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      timer = window.setTimeout(() => reject(new Error(message)), ms);
    }),
  ]).finally(() => window.clearTimeout(timer));
}

/**
 * A transcript built from recorded clips, each sent to the server's recogniser.
 *
 * Replaces the browser's own recogniser for short recordings, so the result no
 * longer depends on which browser the tutor happens to use. There is no live
 * text while someone speaks: each clip comes back a second or two after it
 * ends.
 *
 * Built for a bad connection, because that is where it is used: a lesson on a
 * phone in China lost forty minutes of an hour when every piece was sent as
 * WAV, five times bigger than the connection could carry in time. So a piece
 * goes as the browser recorded it, compressed, and as WAV only if the server
 * asks. It is tried again after a pause when the network drops it, at most two
 * go at once, and none can keep the tutor waiting for ever.
 *
 * A clip that fails is kept in memory, not dropped, and while `autoRetry` is
 * on it is sent again every half minute; the tutor can always retry it by
 * hand. Nothing is stored anywhere else.
 */
export function useClipTranscriber(
  language: string,
  {
    lines = false,
    autoRetry = false,
  }: {
    /** Ask for each sentence separately: a group lesson credits them one by one. */
    lines?: boolean;
    /** Send failed pieces again by themselves, every half minute. */
    autoRetry?: boolean;
  } = {},
) {
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
  /** Uploads under way, and the ones waiting their turn. */
  const slotsRef = useRef(0);
  const queueRef = useRef<(() => void)[]>([]);

  const takeSlot = useCallback(async () => {
    if (slotsRef.current >= AT_ONCE) {
      await new Promise<void>((resolve) => queueRef.current.push(resolve));
    }
    slotsRef.current++;
  }, []);
  const giveSlot = useCallback(() => {
    slotsRef.current--;
    queueRef.current.shift()?.();
  }, []);

  /** One POST of one body, with its own time limit. */
  const post = useCallback(
    async (body: Blob, type: string) => {
      let res: Response;
      try {
        res = await fetch(
          `/api/transcribe?lang=${encodeURIComponent(language)}${lines ? "&lines=1" : ""}`,
          {
            method: "POST",
            headers: { "Content-Type": type },
            body,
            signal: AbortSignal.timeout(UPLOAD_MS),
          },
        );
      } catch {
        throw new Error("Could not reach the server - probably the connection.");
      }
      const data = (await res.json().catch(() => ({}))) as {
        text?: string;
        lines?: { at: number; text: string }[];
        error?: string;
        retryAs?: string;
      };
      if (!res.ok) {
        throw new ServerSaid(
          data.error ?? `Transcription failed (${res.status}).`,
          res.status,
          data.retryAs === "wav",
        );
      }
      return data;
    },
    [language, lines],
  );

  /** Send one piece until it lands or the attempts run out. */
  const deliver = useCallback(
    async (clip: Blob) => {
      let body: Blob = clip;
      let type = (clip.type || "audio/webm").split(";")[0];
      let lastError: Error = new Error("Transcription failed.");
      for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
        try {
          return await post(body, type);
        } catch (e) {
          lastError = e instanceof Error ? e : lastError;
          if (e instanceof ServerSaid && e.wantsWav && type !== "audio/wav") {
            // The provider could not read this container. WAV it can; the
            // browser decodes its own recording to make one.
            const wav = await within(toSpeechWav(clip), 30_000, "This recording could not be read on this device.").catch(() => {
              throw new Error("This recording could not be read on this device.");
            });
            if (!wav) return { text: "" };
            body = wav;
            type = "audio/wav";
            attempt--;
            continue;
          }
          // A refusal the server meant - signed out, too big - will not change.
          if (e instanceof ServerSaid && e.status < 500 && e.status !== 408 && e.status !== 429) {
            throw e;
          }
          if (attempt < ATTEMPTS) await wait(attempt * 3000);
        }
      }
      throw lastError;
    },
    [post],
  );

  const sendOne = useCallback(
    async (clip: Blob, t: number, tag?: string, tries = 0) => {
      if (clip.size === 0) return;
      setPending((p) => [...p, tag]);
      try {
        await takeSlot();
        let body: Awaited<ReturnType<typeof deliver>>;
        try {
          body = await within(deliver(clip), PIECE_MS, "This part took too long to send.");
        } finally {
          giveSlot();
        }
        if (body.lines) {
          const added = body.lines.map((line) => ({ t: t + line.at, text: line.text, tag }));
          setSegments((prev) => [...prev, ...added].sort((a, b) => a.t - b.t));
          return;
        }
        const text = (body.text ?? "").trim();
        if (!text) return;
        setSegments((prev) =>
          // Clips can come back out of order; keep the transcript in time order.
          [...prev, { t, text, tag }].sort((a, b) => a.t - b.t),
        );
      } catch (e) {
        const error = e instanceof Error ? e.message : "Transcription failed.";
        setFailed((f) => [...f, { tag, t, clip, error, tries: tries + 1 }]);
      } finally {
        setPending((p) => {
          const i = p.indexOf(tag);
          return i < 0 ? p : [...p.slice(0, i), ...p.slice(i + 1)];
        });
      }
    },
    [deliver, takeSlot, giveSlot, setSegments, setFailed],
  );

  const send = useCallback(
    (clip: Blob, t: number, tag?: string, tries = 0): Promise<void> => {
      const job = sendOne(clip, t, tag, tries);
      inFlightRef.current.add(job);
      void job.finally(() => inFlightRef.current.delete(job));
      return job;
    },
    [sendOne],
  );

  /**
   * Wait for every clip already sent, then hand back the transcript. What
   * failed is in `failed`, not here - the caller decides whether to retry.
   * Every piece has a time limit, so this always comes back.
   */
  const settle = useCallback(async (): Promise<TranscriptSegment[]> => {
    while (inFlightRef.current.size) await Promise.all([...inFlightRef.current]);
    return segmentsRef.current;
  }, []);

  /** Try failed clips again: all of them, or those still under `maxTries`. */
  const retry = useCallback(
    (maxTries = Infinity) => {
      const again = failedRef.current.filter((f) => f.tries < maxTries);
      if (!again.length) return;
      setFailed(failedRef.current.filter((f) => f.tries >= maxTries));
      for (const f of again) void send(f.clip, f.t, f.tag, f.tries);
    },
    [send, setFailed],
  );

  // While recording, a dropped piece goes again by itself once the
  // connection may be back, so the end of the lesson is not a pile of them.
  useEffect(() => {
    if (!autoRetry) return;
    const id = window.setInterval(() => {
      if (typeof navigator !== "undefined" && navigator.onLine === false) return;
      retry(AUTO_ROUNDS);
    }, RETRY_EVERY_MS);
    return () => window.clearInterval(id);
  }, [autoRetry, retry]);

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
    retry: () => retry(),
    restore,
    reset,
  };
}
