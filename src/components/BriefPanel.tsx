"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api";
import type { LearningBrief } from "@/lib/types";

const DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

function List({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div>
      <p className="t-eyebrow">{title}</p>
      <ul className="list-disc pl-5 t-small space-y-0.5 mt-1">
        {items.map((x) => (
          <li key={x}>{x}</li>
        ))}
      </ul>
    </div>
  );
}

/**
 * "Before the next lesson": the brief, written on request from confirmed data
 * only. It says when newer results have come in since it was written.
 */
export function BriefPanel({ studentId, brief, stale }: { studentId: string; brief?: LearningBrief; stale: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function write() {
    setBusy(true);
    setError(null);
    const r = await api(`/api/students/${studentId}/brief`, { method: "POST" });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    router.refresh();
  }
  return (
    <div className="stack-sm">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-semibold">Before the next lesson</h3>
        {brief && <span className="t-caption t-muted">written {DATE.format(new Date(brief.at))}</span>}
      </div>
      {brief ? (
        <>
          <p className="t-small">{brief.headline}</p>
          <List title="Covered" items={brief.covered} />
          <List title="Practice done" items={brief.practiceDone} />
          <List title="Keeps coming back" items={brief.recurringMistakes} />
          <List title="Improving" items={brief.improving} />
          <List title="Needs more practice" items={brief.needsPractice} />
          <List title="Not finished yet" items={brief.unfinished} />
          <div className="note note-accent t-small">
            <b>Warm-up:</b> {brief.warmup}
          </div>
          <List title="Suggested objectives" items={brief.objectives} />
          <p className="hint">Written from the lesson summaries, the marked answers and the memory. Check it against what you know.</p>
        </>
      ) : (
        <p className="t-small t-muted">A one-minute read before you teach: what was done, what keeps coming back, and a warm-up.</p>
      )}
      <button className="btn btn-quiet btn-sm self-start" disabled={busy} onClick={() => void write()}>
        {busy ? "Writing… about half a minute" : brief ? (stale ? "New results came in - write it again" : "Write it again") : "Write the brief"}
      </button>
      {error && <p className="note note-warn">{error}</p>}
    </div>
  );
}
