"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  SKILL_STATUS_LABEL,
  type Lesson,
  type SkillChange,
} from "@/lib/types";

/**
 * The gate between the model and the student's own screen. The tutor was in the
 * room; the model was not. Nothing here reaches anyone until it is accepted.
 */
export function SkillReview({ lesson }: { lesson: Lesson }) {
  const router = useRouter();
  const [changes, setChanges] = useState<SkillChange[] | null>(null);
  const [keep, setKeep] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const applied = Boolean(lesson.skillsAppliedAt);

  async function propose() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/lessons/${lesson.id}/skills`, {
      method: "POST",
    });
    if (!res.ok) {
      const body = (await res.json()) as { error?: string };
      setError(body.error ?? "Could not read the lesson.");
      setBusy(false);
      return;
    }
    const body = (await res.json()) as { changes: SkillChange[] };
    setChanges(body.changes);
    setKeep(Object.fromEntries(body.changes.map((c) => [c.topic, true])));
    setBusy(false);
  }

  async function apply() {
    if (!changes) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/lessons/${lesson.id}/skills`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ changes: changes.filter((c) => keep[c.topic]) }),
    });
    if (!res.ok) {
      setError("Could not save the changes.");
      setBusy(false);
      return;
    }
    setChanges(null);
    router.refresh();
    setBusy(false);
  }

  if (!lesson.summary) return null;

  return (
    <section className="space-y-4">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="t-subtitle">
          What this lesson changes for the student
        </h2>
        {!changes && (
          <button
            onClick={() => void propose()}
            disabled={busy}
            className="btn btn-quiet btn-sm"
          >
            {busy ? "Reading..." : applied ? "Check again" : "Review"}
          </button>
        )}
      </div>

      {error && <p className="note note-warn">{error}</p>}

      {applied && !changes && (
        <p className="t-caption t-muted">
          Applied {new Date(lesson.skillsAppliedAt!).toLocaleString()}.
        </p>
      )}

      {changes && changes.length === 0 && (
        <p className="empty p-5 t-small t-muted">
          Nothing to change - this lesson did not move any topic on its own.
        </p>
      )}

      {changes && changes.length > 0 && (
        <>
          <ul className="space-y-2">
            {changes.map((change) => (
              <li
                key={change.topic}
                className="card p-4"
              >
                <label className="flex cursor-pointer gap-3">
                  <input
                    type="checkbox"
                    checked={keep[change.topic] ?? false}
                    onChange={(e) =>
                      setKeep({ ...keep, [change.topic]: e.target.checked })
                    }
                    className="mt-1"
                  />
                  <span className="min-w-0">
                    <span className="block t-small font-medium">
                      {change.topic}
                    </span>
                    <span className="block t-caption t-muted">
                      {change.from
                        ? `${SKILL_STATUS_LABEL[change.from]} → ${SKILL_STATUS_LABEL[change.to]}`
                        : `new · ${SKILL_STATUS_LABEL[change.to]}`}
                    </span>
                    <span className="mt-2 block t-small">{change.note}</span>
                    {change.practice && (
                      <span className="mt-1 block t-caption">
                        <span className="text-muted">Practice: </span>
                        {change.practice}
                      </span>
                    )}
                    <span className="mt-2 block t-caption t-muted italic">
                      {change.reason}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => void apply()}
              disabled={busy}
              className="btn btn-primary"
            >
              {busy ? "Saving..." : "Apply to student"}
            </button>
            <button
              onClick={() => setChanges(null)}
              className="btn btn-quiet"
            >
              Discard
            </button>
          </div>
        </>
      )}
    </section>
  );
}
