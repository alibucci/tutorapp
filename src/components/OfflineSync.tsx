"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  deleteEnd,
  deletePiece,
  isLiveElsewhere,
  listEnds,
  listPieces,
  waiting,
  type StoredPiece,
} from "@/lib/offlineAudio";
import { toSpeechWav } from "@/lib/wav";

type Line = { t: number; text: string; tag?: string };

/** One kept piece to text. Null when the connection failed; [] when there was nothing to read. */
async function transcribe(piece: StoredPiece): Promise<Line[] | null> {
  const url = `/api/transcribe?lang=${encodeURIComponent(piece.language)}${piece.lines ? "&lines=1" : ""}`;
  const post = (body: Blob, type: string) =>
    fetch(url, { method: "POST", headers: { "Content-Type": type }, body, signal: AbortSignal.timeout(90_000) });
  let res: Response;
  try {
    res = await post(piece.blob, (piece.blob.type || "audio/webm").split(";")[0]);
    if (res.status === 422) {
      const wav = await toSpeechWav(piece.blob).catch(() => null);
      if (!wav) return [];
      res = await post(wav, "audio/wav");
    }
  } catch {
    return null;
  }
  if (!res.ok) return null;
  const data = (await res.json().catch(() => ({}))) as { text?: string; lines?: { at: number; text: string }[] };
  if (data.lines) return data.lines.map((l) => ({ t: piece.t + l.at, text: l.text, tag: piece.tag }));
  const text = (data.text ?? "").trim();
  return text ? [{ t: piece.t, text, tag: piece.tag }] : [];
}

/**
 * Sends what a lesson with no internet left on this device, once the internet
 * is back - on any page of the tutor's, when it opens, when the connection
 * returns and every minute. The text joins the lesson on the server first;
 * only then is the device's copy of the audio deleted.
 *
 * A lesson still open in a recorder page is left to that page.
 */
export function OfflineSync() {
  const router = useRouter();
  const [state, setState] = useState({ lessons: 0, pieces: 0, ms: 0 });
  const [busy, setBusy] = useState(false);
  // Read only once something is waiting, which the server never renders.
  const [online, setOnline] = useState(() => typeof navigator === "undefined" || navigator.onLine !== false);
  const running = useRef(false);

  const sync = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    try {
      if (navigator.onLine === false) return;
      const [pieces, ends] = await Promise.all([listPieces(), listEnds()]);
      const lessons = new Set([...pieces.map((p) => p.lessonId), ...ends.map((e) => e.lessonId)]);
      let changed = false;
      for (const lessonId of lessons) {
        if (isLiveElsewhere(lessonId)) continue;
        const mine = pieces.filter((p) => p.lessonId === lessonId).sort((a, b) => a.t - b.t);
        const end = ends.find((e) => e.lessonId === lessonId);
        const lines: Line[] = [...(end?.transcript ?? [])];
        const sent: number[] = [];
        let offline = false;
        for (const piece of mine) {
          const got = await transcribe(piece);
          if (got === null) {
            offline = true;
            break;
          }
          lines.push(...got);
          sent.push(piece.id!);
        }
        if (!lines.length && !end && !sent.length) continue;
        const res = await fetch(`/api/lessons/${lessonId}/transcript`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            segments: lines,
            ...(end && !offline && {
              end: { endedAt: end.endedAt, recordedMs: end.recordedMs, interruptions: end.interruptions },
            }),
          }),
        }).catch(() => null);
        // Kept until the server has the text: another account's lesson, or a
        // failed save, stays on the device (for at most 7 days).
        if (!res?.ok) continue;
        await Promise.all(sent.map((id) => deletePiece(id)));
        if (end && !offline) await deleteEnd(lessonId);
        changed = true;
        if (offline) break;
      }
      if (changed) router.refresh();
    } finally {
      setState(await waiting());
      running.current = false;
      setBusy(false);
    }
  }, [router]);

  useEffect(() => {
    void sync();
    const up = () => {
      setOnline(true);
      void sync();
    };
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    const timer = window.setInterval(() => void sync(), 60_000);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
      window.clearInterval(timer);
    };
  }, [sync]);

  if (!state.lessons) return null;
  const minutes = Math.max(1, Math.round(state.ms / 60_000));
  return (
    <div className="note note-warn mb-4 flex flex-wrap items-center justify-between gap-3" role="status">
      <span>
        {state.lessons === 1 ? "One lesson is" : `${state.lessons} lessons are`} waiting to send
        {state.pieces ? ` (${minutes} min of audio kept on this device)` : ""}.{" "}
        {online ? "Sending them now." : "No internet: they go by themselves when it is back."} Audio is deleted once its
        text is saved, and after 7 days at most.
      </span>
      {online && (
        <button className="btn btn-quiet btn-sm" disabled={busy} onClick={() => void sync()}>
          {busy ? "Sending…" : "Send now"}
        </button>
      )}
    </div>
  );
}
