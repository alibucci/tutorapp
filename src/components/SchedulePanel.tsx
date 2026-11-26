"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api";
import type { DeliveryMode, LearningSchedule, ScheduleEvent } from "@/lib/types";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const ORDER = [1, 2, 3, 4, 5, 6, 0];
const ZONES = ["Asia/Shanghai", "Asia/Hong_Kong", "Asia/Almaty", "Asia/Tashkent", "Europe/Moscow", "Europe/London", "America/New_York"];

const MODES: { value: DeliveryMode; label: string; hint: string }[] = [
  { value: "approval", label: "Made ahead, you approve", hint: "Ready at the time, waits for you to check and send. You get a notice." },
  { value: "auto", label: "Sent by itself", hint: "Made from the newest results and sent at the time - unless \"I approve practice first\" is ticked in the learning programme." },
  { value: "manual", label: "Only when you make one", hint: "The schedule makes nothing; use Smart Review below." },
];

const OUTCOME: Record<ScheduleEvent["outcome"], string> = {
  sent: "Sent",
  awaiting_approval: "Waiting for you",
  deferred: "Held back",
  skipped: "Skipped",
  failed: "Failed",
};

const DATE = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" });

/**
 * The learner's practice schedule. Changes apply to the slots still to come;
 * anything already sent stays. The log says what the schedule did and why.
 */
export function SchedulePanel({
  studentId,
  studentName,
  schedule,
  next,
}: {
  studentId: string;
  studentName: string;
  schedule: LearningSchedule;
  /** The next slot in the learner's time, already worded: "Wed 27 Nov, 17:00". */
  next: string | null;
}) {
  const router = useRouter();
  const [s, setS] = useState(schedule);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const zones = ZONES.includes(s.timezone) ? ZONES : [s.timezone, ...ZONES];

  async function save(patch: Partial<LearningSchedule> & { paused?: boolean }) {
    setBusy(true);
    setError(null);
    setSaved(false);
    const r = await api<LearningSchedule>(`/api/students/${studentId}/schedule`, { method: "PUT", json: patch });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setS(r.data);
    setSaved(true);
    router.refresh();
  }

  const toggle = (list: number[], day: number) => (list.includes(day) ? list.filter((d) => d !== day) : [...list, day]);
  const settings = () => ({
    enabled: s.enabled,
    reviewDays: s.reviewDays,
    lessonDays: s.lessonDays ?? [],
    time: s.time,
    timezone: s.timezone,
    minutes: s.minutes,
    maxPerWeek: s.maxPerWeek,
    mode: s.mode,
  });

  return (
    <section className="card card-pad stack-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold">Learning schedule</h2>
        <label className="flex items-center gap-2 t-small cursor-pointer">
          <input type="checkbox" checked={s.enabled} onChange={(e) => setS({ ...s, enabled: e.target.checked })} />
          On
        </label>
      </div>
      <p className="t-small t-muted">
        When Smart Reviews come for {studentName} between lessons. Lesson homework goes out as before, apart from this.
      </p>

      <div className="stack-sm">
        <span className="label">Smart Review days</span>
        <div className="flex flex-wrap gap-1.5">
          {ORDER.map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={s.reviewDays.includes(d)}
              onClick={() => setS({ ...s, reviewDays: toggle(s.reviewDays, d) })}
              className={`btn btn-sm ${s.reviewDays.includes(d) ? "btn-primary" : "btn-quiet"}`}
            >
              {DAYS[d]}
            </button>
          ))}
        </div>
        <span className="label">Lesson days</span>
        <div className="flex flex-wrap gap-1.5">
          {ORDER.map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={(s.lessonDays ?? []).includes(d)}
              onClick={() => setS({ ...s, lessonDays: toggle(s.lessonDays ?? [], d) })}
              className={`btn btn-sm ${(s.lessonDays ?? []).includes(d) ? "btn-primary" : "btn-quiet"}`}
            >
              {DAYS[d]}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="label">Time</span>
          <input type="time" className="field" value={s.time} onChange={(e) => setS({ ...s, time: e.target.value })} />
        </label>
        <label className="block">
          <span className="label">Their time zone</span>
          <select className="field" value={s.timezone} onChange={(e) => setS({ ...s, timezone: e.target.value })}>
            {zones.map((z) => (
              <option key={z} value={z}>
                {z.replace("_", " ")}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="label">Length</span>
          <select className="field" value={s.minutes} onChange={(e) => setS({ ...s, minutes: Number(e.target.value) })}>
            {[5, 10, 15].map((m) => (
              <option key={m} value={m}>
                {m} minutes
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="label">At most, per week</span>
          <select className="field" value={s.maxPerWeek} onChange={(e) => setS({ ...s, maxPerWeek: Number(e.target.value) })}>
            {[1, 2, 3, 4, 5].map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
      </div>

      <fieldset className="stack-sm">
        <legend className="label">How it reaches {studentName}</legend>
        {MODES.map((m) => (
          <label key={m.value} className={`choice ${s.mode === m.value ? "choice-on" : ""}`}>
            <input type="radio" name="mode" className="mt-1" checked={s.mode === m.value} onChange={() => setS({ ...s, mode: m.value })} />
            <span>
              <span className="block t-small font-medium">{m.label}</span>
              <span className="block t-caption t-muted">{m.hint}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <div className="flex flex-wrap items-center gap-2">
        <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => void save(settings())}>
          {busy ? "Saving…" : "Save schedule"}
        </button>
        {s.enabled && (
          <button className="btn btn-quiet btn-sm" disabled={busy} onClick={() => void save({ paused: !s.pausedAt })}>
            {s.pausedAt ? "Resume" : "Pause"}
          </button>
        )}
        {saved && <span className="t-small t-muted">Saved.</span>}
      </div>

      <p className="t-small">
        {!s.enabled
          ? "Off: nothing is made by itself."
          : s.pausedAt
            ? `Paused since ${DATE.format(new Date(s.pausedAt))} - nothing is made until you resume.`
            : s.mode === "manual"
              ? "Nothing is made by itself: make one below when you want."
              : next
                ? `Next: ${next} (their time).`
                : "No day chosen yet."}
      </p>

      {(s.log ?? []).length > 0 && (
        <details className="t-small">
          <summary className="cursor-pointer">What the schedule did</summary>
          <ul className="mt-2 stack-sm">
            {[...(s.log ?? [])].reverse().slice(0, 6).map((e) => (
              <li key={`${e.slot}-${e.at}`}>
                <span className="font-medium">{DATE.format(new Date(`${e.slot}T12:00:00Z`))}</span> · {OUTCOME[e.outcome]}
                <span className="block t-caption t-muted">
                  {e.reason}
                  {e.lessonId && (
                    <>
                      {" "}
                      <a className="underline" href={`/lesson/${e.lessonId}/review#homework`}>
                        Open
                      </a>
                    </>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
      {error && <p className="note note-warn">{error}</p>}
    </section>
  );
}
