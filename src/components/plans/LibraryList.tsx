"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { api } from "@/lib/api";
import { LEVELS } from "@/lib/profile";

export type LibraryRow = {
  planId: string;
  cardId: string;
  topic: string;
  words: string[];
  goal: string;
  ages: number[];
  level?: string;
  mark?: "worked" | "not";
  slides: number;
  from: string;
  fresh: boolean;
  builtAt: string;
};

const AGES = [
  { id: "", label: "Any age" },
  { id: "young", label: "Up to 6" },
  { id: "mid", label: "7 to 9" },
  { id: "old", label: "10 and up" },
];

function fitsAge(row: LibraryRow, band: string): boolean {
  if (!band) return true;
  if (!row.ages.length) return false;
  const youngest = Math.min(...row.ages);
  return band === "young" ? youngest <= 6 : band === "mid" ? youngest >= 7 && youngest <= 9 : youngest >= 10;
}

export function LibraryList({ rows, plans }: { rows: LibraryRow[]; plans: { id: string; name: string }[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [age, setAge] = useState("");
  const [level, setLevel] = useState("");
  const [mark, setMark] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [note, setNote] = useState<string | null>(null);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (!needle || [r.topic, r.goal, ...r.words].some((t) => t.toLowerCase().includes(needle))) &&
        fitsAge(r, age) &&
        (!level || r.level === level) &&
        (!mark || (mark === "none" ? !r.mark : r.mark === mark)),
    );
  }, [rows, q, age, level, mark]);

  const key = (r: LibraryRow) => `${r.planId}:${r.cardId}`;

  async function setMarkOf(r: LibraryRow, value: "worked" | "not" | "none") {
    await api(`/api/plans/${r.planId}/cards/${r.cardId}`, { method: "PATCH", json: { mark: value } });
    router.refresh();
  }

  async function addToPlan(r: LibraryRow, planId: string) {
    const result = await api(`/api/plans/${planId}/cards`, {
      method: "POST",
      json: { copyFrom: { planId: r.planId, cardId: r.cardId } },
    });
    setNote(result.ok ? `"${r.topic}" added to ${plans.find((p) => p.id === planId)?.name}.` : result.error);
    router.refresh();
  }

  if (!rows.length) {
    return <p className="note note-quiet">Nothing here yet. Lessons appear once their slides are written.</p>;
  }

  return (
    <div className="stack">
      <div className="grid gap-2 sm:grid-cols-4">
        <input className="field sm:col-span-4" placeholder="Search a topic or a word" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="field" value={age} onChange={(e) => setAge(e.target.value)}>
          {AGES.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
        </select>
        <select className="field" value={level} onChange={(e) => setLevel(e.target.value)}>
          <option value="">Any level</option>
          {LEVELS.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
        </select>
        <select className="field" value={mark} onChange={(e) => setMark(e.target.value)}>
          <option value="">Any note</option>
          <option value="worked">Worked</option>
          <option value="not">Did not suit</option>
          <option value="none">No note</option>
        </select>
        <a
          className={`btn btn-primary ${picked.length ? "" : "pointer-events-none opacity-50"}`}
          href={`/api/library/pack?${picked.map((p) => `c=${encodeURIComponent(p)}`).join("&")}`}
          aria-disabled={!picked.length}
          download
        >
          Save {picked.length || ""} for offline
        </a>
      </div>
      {note && <p className="note note-accent">{note}</p>}
      <ul className="stack-sm">
        {shown.map((r) => (
          <li key={key(r)} className="card card-pad stack-sm">
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                className="mt-1.5 h-5 w-5"
                aria-label={`Pick "${r.topic}" for the offline file`}
                checked={picked.includes(key(r))}
                onChange={(e) =>
                  setPicked((all) => (e.target.checked ? [...all, key(r)] : all.filter((x) => x !== key(r))).slice(0, 12))
                }
              />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{r.topic}</span>
                <span className="block t-small t-muted">
                  {r.words.join(" · ")} · {r.slides} slides
                  {r.ages.length ? ` · age ${Math.min(...r.ages)}${r.ages.length > 1 ? `-${Math.max(...r.ages)}` : ""}` : ""}
                  {r.level ? ` · ${LEVELS.find((l) => l.id === r.level)?.label ?? r.level}` : ""}
                </span>
                <span className="block t-caption t-muted">Made for {r.from}{r.fresh ? " · saved offline" : ""}</span>
              </span>
              <a href={`/plans/${r.planId}/${r.cardId}`} className="btn btn-ghost btn-sm">Open</a>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                className={`btn btn-sm ${r.mark === "worked" ? "btn-primary" : "btn-quiet"}`}
                aria-pressed={r.mark === "worked"}
                onClick={() => void setMarkOf(r, r.mark === "worked" ? "none" : "worked")}
              >
                Worked
              </button>
              <button
                className={`btn btn-sm ${r.mark === "not" ? "btn-primary" : "btn-quiet"}`}
                aria-pressed={r.mark === "not"}
                onClick={() => void setMarkOf(r, r.mark === "not" ? "none" : "not")}
              >
                Did not suit
              </button>
              {plans.length > 0 && (
                <select
                  className="field ml-auto w-auto"
                  value=""
                  aria-label={`Use "${r.topic}" in a plan`}
                  onChange={(e) => e.target.value && void addToPlan(r, e.target.value)}
                >
                  <option value="">Use in a plan…</option>
                  {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              )}
            </div>
          </li>
        ))}
      </ul>
      {!shown.length && <p className="note note-quiet">No lesson fits. Change the search or the filters.</p>}
    </div>
  );
}
