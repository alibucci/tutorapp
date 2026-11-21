"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api";
import { GROUP_MAX, GROUP_MIN } from "@/lib/groupRules";
import type { LessonPlan } from "@/lib/types";

type Item = { id: string; name: string };

/** Who the plan is for: one child, a saved group, or several children now. */
export function NewPlanPicker({ students, groups }: { students: Item[]; groups: Item[] }) {
  const router = useRouter();
  const [kind, setKind] = useState<"one" | "group" | "several">("one");
  const [studentId, setStudentId] = useState(students[0]?.id ?? "");
  const [groupId, setGroupId] = useState(groups[0]?.id ?? "");
  const [several, setSeveral] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!students.length) {
    return <p className="note note-quiet">Add a student first: a plan is built for a child or a group.</p>;
  }

  async function open() {
    setBusy(true);
    setError(null);
    const json =
      kind === "one" ? { studentId } : kind === "group" ? { groupId } : { studentIds: several };
    const result = await api<LessonPlan>("/api/plans", { method: "POST", json });
    if (!result.ok) {
      setBusy(false);
      setError(result.error);
      return;
    }
    router.push(`/plans/${result.data.id}`);
  }

  const ready =
    kind === "one" ? Boolean(studentId) : kind === "group" ? Boolean(groupId) : several.length >= GROUP_MIN && several.length <= GROUP_MAX;

  return (
    <section className="card card-pad stack">
      <h2 className="t-title">New plan</h2>
      <div className="segmented" role="radiogroup" aria-label="Who for">
        {(
          [
            ["one", "One child"],
            ...(groups.length ? [["group", "Saved group"]] : []),
            ...(students.length >= GROUP_MIN ? [["several", "Several children"]] : []),
          ] as [typeof kind, string][]
        ).map(([id, label]) => (
          <button key={id} type="button" role="radio" aria-checked={kind === id} onClick={() => setKind(id)}>
            {label}
          </button>
        ))}
      </div>

      {kind === "one" && (
        <select className="field" value={studentId} onChange={(e) => setStudentId(e.target.value)}>
          {students.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      )}
      {kind === "group" && (
        <select className="field" value={groupId} onChange={(e) => setGroupId(e.target.value)}>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>{g.name}</option>
          ))}
        </select>
      )}
      {kind === "several" && (
        <fieldset className="space-y-1.5">
          <legend className="hint">They are saved as a group, so you can pick them in one tap next time.</legend>
          {students.map((s) => (
            <label key={s.id} className="flex items-center gap-2 t-small">
              <input
                type="checkbox"
                checked={several.includes(s.id)}
                onChange={(e) =>
                  setSeveral((prev) => (e.target.checked ? [...prev, s.id] : prev.filter((x) => x !== s.id)))
                }
              />
              {s.name}
            </label>
          ))}
        </fieldset>
      )}
      {error && <p className="note note-warn">{error}</p>}
      <button className="btn btn-primary self-start" disabled={busy || !ready} onClick={() => void open()}>
        {busy ? "Opening…" : "Open the plan"}
      </button>
    </section>
  );
}
