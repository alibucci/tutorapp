"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

type Pick = { id: string; topic: string; role: "weak" | "consolidate" | "apply"; why: string };
export type ReviewRow = { id: string; title: string; state: string; tone: string };

const ROLE: Record<Pick["role"], string> = {
  weak: "needs work",
  consolidate: "keep fresh",
  apply: "use somewhere new",
};

/**
 * Smart Review on the student's page: what the memory recommends and why,
 * the tutor's own choice if they want one, then make it. The games are built
 * as a draft and the tutor lands on it to look and send.
 */
export function SmartReviewPanel({
  studentId,
  studentName,
  skills,
  recent,
}: {
  studentId: string;
  studentName: string;
  skills: { id: string; topic: string }[];
  recent: ReviewRow[];
}) {
  const router = useRouter();
  const [minutes, setMinutes] = useState(10);
  const [picks, setPicks] = useState<Pick[] | null>(null);
  const [covered, setCovered] = useState<string[]>([]);
  const [own, setOwn] = useState<string[] | null>(null);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const base = `/api/students/${studentId}/review`;

  useEffect(() => {
    let live = true;
    void api<{ picks: Pick[]; covered: string[] }>(`${base}?minutes=${minutes}`).then((r) => {
      if (!live) return;
      if (r.ok) {
        setPicks(r.data.picks);
        setCovered(r.data.covered);
      } else setError(r.error);
    });
    return () => {
      live = false;
    };
  }, [base, minutes]);

  const chosen = own ?? picks?.map((p) => p.id) ?? [];

  async function make() {
    setBusy(true);
    setError(null);
    const r = await api<{ id: string; built: boolean }>(base, {
      method: "POST",
      json: { minutes, ...(own && { skillIds: own }), comment },
    });
    if (!r.ok) {
      setBusy(false);
      return setError(r.error);
    }
    router.push(`/lesson/${r.data.id}/review#homework`);
  }

  return (
    <section className="card card-pad stack-sm">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-semibold">Smart Review</h2>
        <span className="t-small t-muted">practice between lessons</span>
      </div>
      <p className="t-small t-muted">
        New questions on what {studentName} still finds hard, what is due back, and what they know - from what the lessons
        covered. You see it before it is sent.
      </p>

      <div className="flex gap-2" role="radiogroup" aria-label="How long">
        {[5, 10, 15].map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={minutes === m}
            onClick={() => setMinutes(m)}
            className={`btn btn-sm ${minutes === m ? "btn-primary" : "btn-quiet"}`}
          >
            {m} min
          </button>
        ))}
      </div>

      {picks === null ? (
        <p className="t-small t-muted">Reading {studentName}&rsquo;s memory…</p>
      ) : picks.length === 0 && !own ? (
        <p className="t-small t-muted">Nothing to review yet: skills appear once a lesson has been reviewed.</p>
      ) : (
        <div className="stack-sm">
          <p className="label">{own ? "Your choice" : "Recommended"}</p>
          <ul className="stack-sm">
            {(own ? skills.filter((s) => own.includes(s.id)) : picks).map((s) => {
              const p = picks.find((x) => x.id === s.id);
              return (
                <li key={s.id} className="t-small">
                  <span className="font-medium">{s.topic}</span>
                  {p && <span className="t-muted"> · {ROLE[p.role]}</span>}
                  {p && <span className="block t-caption t-muted">{p.why}</span>}
                </li>
              );
            })}
          </ul>
          <details className="t-small">
            <summary className="cursor-pointer">Choose the skills yourself</summary>
            <ul className="mt-2 stack-sm">
              {skills.map((s) => (
                <li key={s.id}>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={chosen.includes(s.id)}
                      onChange={(e) => setOwn(e.target.checked ? [...chosen, s.id] : chosen.filter((x) => x !== s.id))}
                    />
                    {s.topic}
                  </label>
                </li>
              ))}
            </ul>
            {own && (
              <button type="button" className="btn btn-quiet btn-sm mt-2" onClick={() => setOwn(null)}>
                Back to the recommendation
              </button>
            )}
          </details>
          {covered.length > 0 && <p className="hint">Material from the lessons: {covered.slice(0, 6).join(" · ")}{covered.length > 6 ? " …" : ""}</p>}
        </div>
      )}

      <label className="block">
        <span className="label">Anything to add? (optional)</span>
        <input className="field" value={comment} maxLength={300} onChange={(e) => setComment(e.target.value)} placeholder="More speaking, use the Creation story" />
      </label>

      <button className="btn btn-primary self-start" disabled={busy || chosen.length === 0} onClick={() => void make()}>
        {busy ? "Making the games… about half a minute" : "Make Smart Review"}
      </button>
      {error && <p className="note note-warn">{error}</p>}

      {recent.length > 0 && (
        <ul className="rows mt-2">
          {recent.map((r) => (
            <li key={r.id}>
              <Link href={`/lesson/${r.id}/review#homework`} className="row row-link py-2.5">
                <span className="min-w-0 flex-1 truncate t-small font-medium">{r.title}</span>
                <span className={`shrink-0 t-small font-semibold ${r.tone}`}>{r.state}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
