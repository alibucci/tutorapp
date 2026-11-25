"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { pickMimeType } from "@/hooks/useTutorRecorder";
import { toSpeechWav } from "@/lib/wav";

/**
 * The homework's microphone: record an answer, have the server read it.
 *
 * It was the browser's own recogniser, which is Google behind Chrome -
 * unreachable from mainland China, so the button listened and nothing came
 * back - and is missing altogether inside WeChat. Recording here and
 * recognising on the server (api/lessons/[id]/homework/speech) works wherever
 * the page can use a microphone at all. The recording stays in memory until it
 * is sent, and the server does not keep it.
 *
 * No live text while the child speaks: the words arrive a second or two after
 * they tap stop.
 */

/** Which homework the answers belong to; set once, by the homework page. */
export const AnswerMicContext = createContext<{ lessonId: string; linkKey?: string } | null>(null);

/** Long enough for any answer; a forgotten tap stops by itself. */
const MAX_MS = 60_000;
const UPLOAD_MS = 45_000;

export type AnswerMicState = "idle" | "listening" | "working";

function childMessage(e: unknown): string {
  if (typeof navigator !== "undefined" && !navigator.mediaDevices) {
    return "The microphone does not work in this app. Open the link in Safari or Chrome - or type below.";
  }
  const name = e instanceof DOMException || e instanceof Error ? e.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "The microphone is not allowed. Let this page use it, then try again - or type below.";
  }
  if (name === "NotFoundError" || name === "NotReadableError") {
    return "No microphone was found. You can type below.";
  }
  return "The microphone did not work. You can type below.";
}

async function post(url: string, body: Blob, type: string) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": type },
    body,
    signal: AbortSignal.timeout(UPLOAD_MS),
  });
  const data = (await res.json().catch(() => ({}))) as {
    text?: string;
    error?: string;
    retryAs?: string;
  };
  return { ok: res.ok, wantsWav: data.retryAs === "wav", text: data.text ?? "" };
}

/** For a homework page itself; anything inside it reads AnswerMicContext. */
export function useAnswerMic(lessonId?: string, linkKey?: string) {
  const given = useContext(AnswerMicContext);
  const id = lessonId ?? given?.lessonId;
  const key = lessonId ? linkKey : given?.linkKey;
  const [state, setState] = useState<AnswerMicState>("idle");
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<{ recorder: MediaRecorder; chunks: Blob[]; stream: MediaStream } | null>(null);
  const timerRef = useRef(0);
  /** Where the words go once they are back; set by start(). */
  const doneRef = useRef<((text: string) => void) | null>(null);
  /** A tap on stop that came while the microphone was still opening. */
  const cancelledRef = useRef(false);
  /** Which recording is current; a late answer to an older one is dropped. */
  const runRef = useRef(0);

  const release = useCallback(() => {
    window.clearTimeout(timerRef.current);
    recRef.current?.stream.getTracks().forEach((t) => t.stop());
    recRef.current = null;
  }, []);

  useEffect(
    () => () => {
      cancelledRef.current = true;
      if (recRef.current?.recorder.state === "recording") recRef.current.recorder.stop();
      release();
    },
    [release],
  );

  /** Send the clip; the words, or "" with `error` set. */
  const recognise = useCallback(
    async (clip: Blob): Promise<string> => {
      if (!id) return "";
      const url = `/api/lessons/${encodeURIComponent(id)}/homework/speech${
        key ? `?key=${encodeURIComponent(key)}` : ""
      }`;
      try {
        let result = await post(url, clip, (clip.type || "audio/webm").split(";")[0]);
        if (!result.ok && result.wantsWav) {
          const wav = await toSpeechWav(clip).catch(() => null);
          if (!wav) {
            setError("I didn't catch that. Try again, a little longer - or type below.");
            return "";
          }
          result = await post(url, wav, "audio/wav");
        }
        if (!result.ok) {
          setError("That did not work this time. Try again - or type below.");
          return "";
        }
        const text = result.text.trim();
        if (!text) setError("I didn't catch that. Try again, a little louder - or type below.");
        return text;
      } catch {
        setError("The internet dropped. Try again - or type below.");
        return "";
      }
    },
    [id, key],
  );

  /**
   * Open the microphone and record. Call it from the tap. The words go to
   * `onText` when they are back - after a tap on stop, or after a minute.
   */
  const start = useCallback(async (onText: (text: string) => void) => {
    if (state !== "idle") return;
    const run = ++runRef.current;
    setError(null);
    cancelledRef.current = false;
    doneRef.current = onText;
    setState("listening");
    let stream: MediaStream;
    try {
      if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        throw new Error("unsupported");
      }
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch (e) {
      if (run !== runRef.current) return;
      setError(childMessage(e));
      setState("idle");
      return;
    }
    if (cancelledRef.current || run !== runRef.current) {
      stream.getTracks().forEach((t) => t.stop());
      setState("idle");
      return;
    }
    const mimeType = pickMimeType();
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType, audioBitsPerSecond: 32000 } : undefined);
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    recorder.onstop = () => {
      const clip = new Blob(chunks, { type: recorder.mimeType || mimeType || "audio/webm" });
      release();
      const done = doneRef.current;
      doneRef.current = null;
      if (cancelledRef.current || !done) {
        setState("idle");
        return;
      }
      setState("working");
      void recognise(clip).then((text) => {
        if (run !== runRef.current) return;
        setState("idle");
        if (text && !cancelledRef.current) done(text);
      });
    };
    recRef.current = { recorder, chunks, stream };
    recorder.start();
    // Stops by itself; whatever was said so far still counts.
    timerRef.current = window.setTimeout(() => {
      if (recorder.state === "recording") recorder.stop();
    }, MAX_MS);
  }, [state, recognise, release]);

  /** Stop recording; the words follow, to the `onText` given to start(). */
  const stop = useCallback(() => {
    const rec = recRef.current;
    if (rec?.recorder.state === "recording") {
      rec.recorder.stop();
      return;
    }
    // Still opening the microphone: drop it when it opens.
    runRef.current++;
    cancelledRef.current = true;
    setState("idle");
  }, []);

  /** Stop and forget what was said - moving on to another task. */
  const cancel = useCallback(() => {
    runRef.current++;
    cancelledRef.current = true;
    doneRef.current = null;
    if (recRef.current?.recorder.state === "recording") recRef.current.recorder.stop();
    else release();
    setState("idle");
  }, [release]);

  return { available: Boolean(id), state, error, start, stop, cancel };
}
