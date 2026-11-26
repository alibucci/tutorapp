"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api";
import type { PilotRecord } from "@/lib/types";

/** Start or change a pilot: when it began and how many weeks it runs. */
export function PilotSetup({ studentId, pilot, today }: { studentId: string; pilot?: PilotRecord; today: string }) {
  const router = useRouter();
  const [start, setStart] = useState(pilot?.startedAt ?? today);
  const [weeks, setWeeks] = useState(pilot?.weeks ?? 3);
  const [busy, setBusy] = useState(false);
  async function save(json: unknown) {
    setBusy(true);
    await api(`/api/students/${studentId}/pilot`, { method: "PUT", json });
    setBusy(false);
    router.refresh();
  }
  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="block">
        <span className="label">Started</span>
        <input type="date" className="field" value={start} onChange={(e) => setStart(e.target.value)} />
      </label>
      <label className="block">
        <span className="label">Weeks</span>
        <select className="field" value={weeks} onChange={(e) => setWeeks(Number(e.target.value))}>
          {[1, 2, 3, 4, 6, 8].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>
      <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => void save({ startedAt: start, weeks })}>
        {pilot ? "Save" : "Start the pilot"}
      </button>
      {pilot && (
        <button className="btn btn-quiet btn-sm" disabled={busy} onClick={() => window.confirm("End the pilot? Its weekly notes go; the lessons and results stay.") && void save({ end: true })}>
          End the pilot
        </button>
      )}
    </div>
  );
}

/** One week's notes: what the parent said, and what the tutor saw. */
export function PilotNote({ studentId, week, parent, tutor }: { studentId: string; week: string; parent?: string; tutor?: string }) {
  const router = useRouter();
  const [p, setP] = useState(parent ?? "");
  const [t, setT] = useState(tutor ?? "");
  const [state, setState] = useState<"idle" | "busy" | "saved">("idle");
  const changed = p !== (parent ?? "") || t !== (tutor ?? "");
  async function save() {
    setState("busy");
    await api(`/api/students/${studentId}/pilot`, { method: "PUT", json: { note: { week, parent: p, tutor: t } } });
    setState("saved");
    router.refresh();
  }
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <label className="block">
        <span className="label">The parent said</span>
        <textarea className="field" rows={2} maxLength={1000} value={p} onChange={(e) => setP(e.target.value)} placeholder="Did they notice the practice? Did it help?" />
      </label>
      <label className="block">
        <span className="label">You saw</span>
        <textarea className="field" rows={2} maxLength={1000} value={t} onChange={(e) => setT(e.target.value)} placeholder="Enjoyed it? Too long? Easier in the lesson?" />
      </label>
      {(changed || state === "saved") && (
        <button className="btn btn-quiet btn-sm self-start" disabled={state === "busy" || !changed} onClick={() => void save()}>
          {state === "saved" && !changed ? "Saved" : "Save notes"}
        </button>
      )}
    </div>
  );
}
