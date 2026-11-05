"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api";
import { MATH_LEVELS } from "@/lib/math";

/** The tutor turns math practice on, and can move the child's level by hand. */
export function MathPanel({
  studentId,
  studentName,
  on: savedOn,
  level: savedLevel,
  children,
}: {
  studentId: string;
  studentName: string;
  on: boolean;
  level: number;
  children?: React.ReactNode;
}) {
  const router = useRouter();
  // Moved the moment the tutor touches them, or the tick visibly jumps back
  // until the server answers. The page keys this panel on the saved values.
  const [on, setOn] = useState(savedOn);
  const [level, setLevel] = useState(savedLevel);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(math: { on?: boolean; level?: number }) {
    if (math.on !== undefined) setOn(math.on);
    if (math.level !== undefined) setLevel(math.level);
    setSaving(true);
    setError(null);
    const result = await api(`/api/students/${studentId}`, { method: "PATCH", json: { math } });
    setSaving(false);
    if (!result.ok) {
      setOn(savedOn);
      setLevel(savedLevel);
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <section className="card space-y-4 p-4">
      <div>
        <h2 className="font-semibold">Math practice</h2>
        <p className="t-small t-muted mt-1">
          Adding and taking away in {studentName}&rsquo;s theme, separate from
          homework. The level moves by itself as they play.
        </p>
      </div>

      <label className="flex items-center gap-3 font-medium">
        <input
          type="checkbox"
          checked={on}
          disabled={saving}
          onChange={(e) => void save({ on: e.target.checked })}
          className="h-5 w-5"
        />
        Show it to {studentName}
      </label>

      {on && (
        <label className="block">
          <span className="label">Level now</span>
          <select
            value={level}
            disabled={saving}
            onChange={(e) => void save({ level: Number(e.target.value) })}
            className="field"
          >
            {MATH_LEVELS.map((l) => (
              <option key={l.level} value={l.level}>
                {l.level}: {l.label}
              </option>
            ))}
          </select>
        </label>
      )}

      {error && <p className="note note-warn">{error}</p>}

      {children}

      <Link href={`/student/${studentId}/math`} className="btn btn-quiet w-full">
        Preview what {studentName} will see
      </Link>
    </section>
  );
}
