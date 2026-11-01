"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { MoveOptions } from "@/lib/moveLesson";

/**
 * "This lesson is for Victor - wrong student?"
 *
 * Says plainly what moving will do before it does it: the consent rule can
 * delete a transcript, and that is not something to learn afterwards.
 */
export function ChangeStudent({
  lessonId,
  isNote,
  current,
  others,
  blocked,
  hasTranscript,
  hasWritten,
  messageCopied,
}: MoveOptions) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  const chosen = others.find((s) => s.id === target);
  const thing = isNote ? "note" : "lesson";

  useEffect(() => {
    if (!open) return;
    cancelRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  // Nobody else to move it to.
  if (others.length === 0) return null;

  async function move() {
    if (!chosen) return;
    setBusy(true);
    setError(null);
    const result = await api(
      `/api/lessons/${lessonId}/student`,
      { method: "PUT", json: { studentId: chosen.id } },
      "Could not move it. Try again.",
    );
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    if (!chosen.consent) {
      // The transcript is gone from the server; the phone's copy goes with it.
      try {
        window.localStorage.removeItem(`tutor-signal:lesson:${lessonId}`);
      } catch {
        // nothing to clean
      }
    }
    setOpen(false);
    setTarget("");
    router.refresh();
  }

  return (
    <>
      <div className="note note-quiet flex flex-wrap items-center justify-between gap-2">
        <span>
          This {thing} is for <strong className="text-foreground">{current.name}</strong>
        </span>
        <button onClick={() => setOpen(true)} className="btn btn-ghost btn-sm">
          Wrong student?
        </button>
      </div>

      {open && (
        <div
          className="overlay fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center"
          // No margin: the page's stack spaces its children, and this one is
          // pinned to the screen rather than laid out among them.
          style={{ background: "rgb(21 23 28 / 0.45)", margin: 0 }}
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Move this ${thing} to another student`}
            onClick={(e) => e.stopPropagation()}
            className="dialog card w-full max-w-sm space-y-4 p-5"
            style={{ boxShadow: "var(--shadow)" }}
          >
            <h2 className="t-subtitle">Move this {thing} to another student</h2>

            {blocked ? (
              <p className="note note-warn">{blocked}</p>
            ) : (
              <>
                <label className="block">
                  <span className="label">It was really with</span>
                  <select
                    value={target}
                    onChange={(e) => setTarget(e.target.value)}
                    disabled={busy}
                    className="field"
                  >
                    <option value="">Pick a student…</option>
                    {others.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>

                {chosen && (
                  <ul className="space-y-2 t-small">
                    <li className="t-muted">
                      {isNote ? "Your answers move" : "The recording and your debrief move"} to{" "}
                      {chosen.name}. {current.name} no longer sees this {thing}.
                    </li>
                    {hasWritten && (
                      <li className="t-muted">
                        The summary, games and parent message were written for {current.name},
                        so they are cleared and written again for {chosen.name}.
                      </li>
                    )}
                    {hasTranscript && !chosen.consent && (
                      <li className="note note-warn">
                        {chosen.name}&rsquo;s parents have not consented to recording, so this
                        lesson&rsquo;s transcript is deleted. Your debrief stays, and the summary
                        is written from it.
                      </li>
                    )}
                    {messageCopied && (
                      <li className="note note-warn">
                        You already copied the parent message. If you sent it to{" "}
                        {current.name}&rsquo;s parents, you will need to tell them.
                      </li>
                    )}
                  </ul>
                )}
              </>
            )}

            {error && <p className="note note-warn">{error}</p>}

            <div className="flex flex-wrap gap-2">
              {!blocked && (
                <button
                  onClick={() => void move()}
                  disabled={!chosen || busy}
                  className="btn btn-primary"
                >
                  {busy ? "Moving…" : chosen ? `Move to ${chosen.name}` : "Move"}
                </button>
              )}
              <button ref={cancelRef} onClick={() => setOpen(false)} className="btn btn-quiet">
                {blocked ? "OK" : "Cancel"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
