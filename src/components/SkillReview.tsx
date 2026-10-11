"use client";

import { api } from "@/lib/api";
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
export function SkillReview({
  lesson,
  studentName,
}: {
  lesson: Lesson;
  studentName?: string;
}) {
  const router = useRouter();
  const [changes, setChanges] = useState<SkillChange[] | null>(null);
  const [keep, setKeep] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const applied = Boolean(lesson.skillsAppliedAt);

  async function propose() {
    setBusy(true);
    setError(null);
    const result = await api<{ changes: SkillChange[] }>(
      `/api/lessons/${lesson.id}/skills`,
      { method: "POST" },
      "Could not read the lesson.",
    );
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setChanges(result.data.changes);
    setKeep(Object.fromEntries(result.data.changes.map((c) => [c.topic, true])));
  }

  async function apply() {
    if (!changes) return;
    setBusy(true);
    setError(null);
    const result = await api(
      `/api/lessons/${lesson.id}/skills`,
      { method: "PUT", json: { changes: changes.filter((c) => keep[c.topic]) } },
      "Could not save the changes.",
    );
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setChanges(null);
    router.refresh();
  }

  if (!lesson.summary) return null;

  const kept = changes?.filter((c) => keep[c.topic]).length ?? 0;
  const who = studentName ?? "the student";

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-4">
        <h2 className="t-title">Topics</h2>
        {applied && !changes ? (
          <span className="flex items-center gap-2">
            <span className="tag tag-done">
              Applied {DATE.format(new Date(lesson.skillsAppliedAt!))}
            </span>
            <button onClick={() => void propose()} disabled={busy} className="btn btn-ghost btn-sm">
              {busy ? "Reading…" : "Check again"}
            </button>
          </span>
        ) : null}
      </div>
      <p className="t-small t-muted">
        What this lesson changes on {who}&rsquo;s list of topics. Nothing reaches{" "}
        {who} until you apply it.
      </p>

      {error && <p className="note note-warn">{error}</p>}

      {!changes && !applied && (
        <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
          <span className="t-small t-muted">
            The model reads the summary and suggests which topics moved.
          </span>
          <button onClick={() => void propose()} disabled={busy} className="btn btn-soft">
            {busy ? "Reading the lesson…" : "Suggest changes"}
          </button>
        </div>
      )}

      {changes && changes.length === 0 && (
        <p className="empty">Nothing to change - this lesson did not move any topic on its own.</p>
      )}

      {changes && changes.length > 0 && (
        <>
          <ul className="space-y-3">
            {changes.map((change) => {
              const on = keep[change.topic] ?? false;
              return (
                <li
                  key={change.topic}
                  className={`card overflow-hidden transition-opacity ${on ? "" : "opacity-55"}`}
                >
                  <label className="flex cursor-pointer items-start gap-3 p-4">
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={(e) => setKeep({ ...keep, [change.topic]: e.target.checked })}
                      className="mt-1 h-5 w-5 shrink-0 accent-[var(--accent)]"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">{change.topic}</span>
                      <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        {change.from ? (
                          <>
                            <span className={`tag ${TAG[change.from]}`}>
                              {SKILL_STATUS_LABEL[change.from]}
                            </span>
                            <span aria-hidden className="t-muted">→</span>
                          </>
                        ) : (
                          <span className="tag tag-quiet">New</span>
                        )}
                        <span className={`tag ${TAG[change.to]}`}>{SKILL_STATUS_LABEL[change.to]}</span>
                        {!on && <span className="t-caption t-muted">· will not be applied</span>}
                      </span>
                    </span>
                  </label>

                  {/* Who reads what, said plainly: the child reads the first
                      block, nobody but the tutor ever reads the second. */}
                  <div className="space-y-2 px-4 pb-4">
                    <div className="rounded-[var(--radius)] bg-accent-soft px-4 py-3">
                      <p className="t-eyebrow text-accent!">{who} sees</p>
                      <p className="mt-1.5">{change.note}</p>
                      {change.practice && (
                        <p className="mt-1.5 t-small">
                          <span className="font-semibold">Try this: </span>
                          {change.practice}
                        </p>
                      )}
                    </div>
                    <div className="rounded-[var(--radius)] bg-sunken px-4 py-3">
                      <p className="t-eyebrow">Only you see · why</p>
                      <p className="mt-1.5 t-small italic t-muted">{change.reason}</p>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="flex gap-2">
            <button
              onClick={() => void apply()}
              disabled={busy || kept === 0}
              className="btn btn-primary btn-lg flex-1"
            >
              {busy
                ? "Saving…"
                : kept === 0
                  ? "Nothing ticked"
                  : `Apply ${kept} ${kept === 1 ? "change" : "changes"} to ${who}`}
            </button>
            <button onClick={() => setChanges(null)} className="btn btn-quiet btn-lg">
              Discard
            </button>
          </div>
        </>
      )}
    </section>
  );
}

const DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });

/** Same colours as everywhere: amber needs work, blue on its way, green done. */
const TAG = { struggling: "tag-warn", improving: "tag-info", solid: "tag-done" } as const;
