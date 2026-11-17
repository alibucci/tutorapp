"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api";

/**
 * Switching the Christianity programme on for one learner. Off by default;
 * it switches on only with the parent's request ticked, and that date stays
 * beside it. Switching off keeps the place in the programme.
 */
export function ChristianityPanel({
  studentId,
  studentName,
  enabled,
  parentAskedAt,
  passed,
  total,
  next,
  failed,
}: {
  studentId: string;
  studentName: string;
  enabled: boolean;
  parentAskedAt?: string;
  passed: number;
  total: number;
  /** The next story's title, or null at the end of the programme. */
  next: string | null;
  /** Why the next story did not go out by itself, if it did not. */
  failed?: string;
}) {
  const router = useRouter();
  const [asked, setAsked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(on: boolean) {
    setBusy(true);
    setError(null);
    const result = await api(
      `/api/students/${studentId}/christianity`,
      { method: "PATCH", json: { on, parentAsked: asked } },
      "Could not save. Try again.",
    );
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setAsked(false);
    router.refresh();
  }

  return (
    <section className="card card-pad space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="font-semibold">Christianity</p>
        <span className={`tag ${enabled ? "tag-done" : "tag-quiet"}`}>{enabled ? "On" : "Off"}</span>
      </div>
      <p className="t-small t-muted">
        Bible stories for children, one at a time, each with a simple rule for
        living. In English (A1); the note to the parent is in Chinese.
      </p>

      {enabled ? (
        <>
          <p className="t-small">
            {parentAskedAt && (
              <>
                Parent asked: <span className="font-semibold">{DATE.format(new Date(parentAskedAt))}</span>
                <br />
              </>
            )}
            {passed} of {total} stories passed ·{" "}
            {next ? (
              <>
                next: <span className="font-semibold">{next}</span>
              </>
            ) : (
              "that's all for now"
            )}
          </p>
          <button onClick={() => void save(false)} disabled={busy} className="btn btn-quiet btn-block">
            {busy ? "Saving…" : "Switch off"}
          </button>
          {failed && (
            <p className="note note-warn">
              The next story could not be built and sent by itself: {failed}. Use &ldquo;Send the next story now&rdquo; under Extra homework.
            </p>
          )}
          <p className="hint">
            Each story is built and sent by itself when {studentName} finishes the one before.
            Switching off keeps {studentName}&rsquo;s place for later.
          </p>
        </>
      ) : (
        <>
          <label className="flex items-start gap-2 t-small">
            <input
              type="checkbox"
              checked={asked}
              onChange={(e) => setAsked(e.target.checked)}
              className="mt-1"
            />
            <span>The parent asked for this</span>
          </label>
          {parentAskedAt && (
            <p className="hint">
              Last asked {DATE.format(new Date(parentAskedAt))}. {passed} of {total} stories passed so far.
            </p>
          )}
          <button onClick={() => void save(true)} disabled={busy || !asked} className="btn btn-soft btn-block">
            {busy ? "Saving…" : "Switch on"}
          </button>
        </>
      )}
      {error && <p className="note note-warn">{error}</p>}
    </section>
  );
}

const DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });
