"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api";
import type { Skill, SkillArea } from "@/lib/types";

type Group = { keep: string; merge: string[]; name: string; area: SkillArea; parent: string; why: string };

/**
 * "Tidy up topics": the model suggests which tracked skills are really one,
 * and the tutor ticks the groups to merge. Nothing is merged unticked, and a
 * merge loses nothing - the old names are kept as aliases.
 */
export function SkillTidy({ studentId, skills }: { studentId: string; skills: Skill[] }) {
  const router = useRouter();
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [on, setOn] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<number | null>(null);
  const name = (id: string) => skills.find((s) => s.id === id)?.topic ?? id;
  const base = `/api/students/${studentId}/skills/tidy`;

  async function look() {
    setBusy(true);
    setError(null);
    setDone(null);
    const r = await api<{ groups: Group[] }>(base, { method: "POST" });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setGroups(r.data.groups);
    setOn(Object.fromEntries(r.data.groups.map((g) => [g.keep, true])));
  }

  async function merge() {
    if (!groups) return;
    const chosen = groups.filter((g) => on[g.keep]);
    setBusy(true);
    setError(null);
    const r = await api(base, { method: "PUT", json: { groups: chosen } });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setGroups(null);
    setDone(chosen.length);
    router.refresh();
  }

  const ticked = groups?.filter((g) => on[g.keep]).length ?? 0;
  return (
    <div className="stack-sm">
      {!groups && (
        <button className="btn btn-quiet btn-sm self-start" disabled={busy} onClick={() => void look()}>
          {busy ? "Looking for doubles…" : "Tidy up topics"}
        </button>
      )}
      {done !== null && <p className="t-small t-muted">{done ? `Merged ${done} ${done === 1 ? "group" : "groups"}.` : "Nothing merged."}</p>}
      {groups && groups.length === 0 && <p className="t-small t-muted">No doubles: every topic is its own skill.</p>}
      {groups && groups.length > 0 && (
        <div className="card card-pad stack-sm">
          <p className="t-small">These look like one skill. Tick the ones to merge - old names are kept, nothing is lost.</p>
          <ul className="stack-sm">
            {groups.map((g) => (
              <li key={g.keep}>
                <label className="flex items-start gap-2 cursor-pointer">
                  <input type="checkbox" className="mt-1" checked={Boolean(on[g.keep])} onChange={(e) => setOn({ ...on, [g.keep]: e.target.checked })} />
                  <span>
                    <span className="font-medium">{g.name || name(g.keep)}</span>
                    {g.parent && <span className="t-small t-muted"> · part of {g.parent}</span>}
                    <span className="block t-small t-muted">
                      from: {[g.keep, ...g.merge].map(name).join(" · ")}
                    </span>
                    <span className="block t-caption t-muted">{g.why}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <button className="btn btn-primary btn-sm" disabled={busy || ticked === 0} onClick={() => void merge()}>
              {busy ? "Merging…" : `Merge ${ticked}`}
            </button>
            <button className="btn btn-quiet btn-sm" disabled={busy} onClick={() => setGroups(null)}>
              Not now
            </button>
          </div>
        </div>
      )}
      {error && <p className="note note-warn">{error}</p>}
    </div>
  );
}
