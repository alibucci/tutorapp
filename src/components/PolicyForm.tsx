"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api";
import type { LearningPolicy } from "@/lib/types";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const ORDER = [1, 2, 3, 4, 5, 6, 0];
const ZONES = ["Asia/Shanghai", "Asia/Hong_Kong", "Asia/Almaty", "Asia/Tashkent", "Europe/Moscow", "Europe/London", "America/New_York"];

/** The agency's practice defaults and limits, for every tutor at once. */
export function PolicyForm({ policy }: { policy: Omit<LearningPolicy, "updatedAt"> & { updatedAt?: string } }) {
  const router = useRouter();
  const [p, setP] = useState(policy);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const t = p.template;
  const setT = (patch: Partial<LearningPolicy["template"]>) => setP({ ...p, template: { ...t, ...patch } });

  async function save() {
    setBusy(true);
    setNote(null);
    const r = await api<LearningPolicy>("/api/admin/learning", { method: "PUT", json: { template: p.template, requireApproval: p.requireApproval, maxPerWeekCap: p.maxPerWeekCap } });
    setBusy(false);
    setNote(r.ok ? "Saved. New learners start from this; every schedule keeps to the limits." : r.error);
    if (r.ok) router.refresh();
  }

  return (
    <section className="card card-pad stack-sm max-w-2xl">
      <h2 className="font-semibold">Standard programme</h2>
      <p className="t-small t-muted">What a learner&rsquo;s schedule starts as. Tutors change it per child within the limits below.</p>
      <span className="label">Smart Review days</span>
      <div className="flex flex-wrap gap-1.5">
        {ORDER.map((d) => (
          <button
            key={d}
            type="button"
            aria-pressed={t.reviewDays.includes(d)}
            onClick={() => setT({ reviewDays: t.reviewDays.includes(d) ? t.reviewDays.filter((x) => x !== d) : [...t.reviewDays, d] })}
            className={`btn btn-sm ${t.reviewDays.includes(d) ? "btn-primary" : "btn-quiet"}`}
          >
            {DAYS[d]}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="label">Time</span>
          <input type="time" className="field" value={t.time} onChange={(e) => setT({ time: e.target.value })} />
        </label>
        <label className="block">
          <span className="label">Time zone</span>
          <select className="field" value={t.timezone} onChange={(e) => setT({ timezone: e.target.value })}>
            {(ZONES.includes(t.timezone) ? ZONES : [t.timezone, ...ZONES]).map((z) => (
              <option key={z} value={z}>
                {z.replace("_", " ")}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="label">Length</span>
          <select className="field" value={t.minutes} onChange={(e) => setT({ minutes: Number(e.target.value) })}>
            {[5, 10, 15].map((m) => (
              <option key={m} value={m}>
                {m} minutes
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="label">Per week</span>
          <select className="field" value={t.maxPerWeek} onChange={(e) => setT({ maxPerWeek: Number(e.target.value) })}>
            {[1, 2, 3, 4, 5].map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="label">How it reaches the child</span>
          <select className="field" value={t.mode} onChange={(e) => setT({ mode: e.target.value as LearningPolicy["template"]["mode"] })}>
            <option value="approval">Made ahead, tutor approves</option>
            <option value="auto">Sent by itself</option>
            <option value="manual">Only when the tutor makes one</option>
          </select>
        </label>
        <label className="block">
          <span className="label">No child more than, per week</span>
          <select className="field" value={p.maxPerWeekCap} onChange={(e) => setP({ ...p, maxPerWeekCap: Number(e.target.value) })}>
            {[1, 2, 3, 4, 5, 6, 7].map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="choice">
        <input type="checkbox" className="mt-1" checked={p.requireApproval} onChange={(e) => setP({ ...p, requireApproval: e.target.checked })} />
        <span>
          <span className="block t-small font-medium">A tutor approves every Smart Review</span>
          <span className="block t-caption t-muted">Nothing the schedule makes reaches a child before a tutor sends it, whatever the tutor set.</span>
        </span>
      </label>
      <button className="btn btn-primary btn-sm self-start" disabled={busy} onClick={() => void save()}>
        {busy ? "Saving…" : "Save"}
      </button>
      {note && <p className="t-small t-muted">{note}</p>}
    </section>
  );
}
