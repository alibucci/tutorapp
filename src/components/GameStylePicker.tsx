"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { GAME_STYLES } from "@/lib/gameStyles";

/** Which game the student's homework looks like. Saves on change. */
export function GameStylePicker({
  studentId,
  value,
}: {
  studentId: string;
  value?: string;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  async function change(gameStyle: string) {
    setSaving(true);
    await fetch(`/api/students/${studentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gameStyle }),
    });
    setSaving(false);
    router.refresh();
  }

  return (
    <label className="block max-w-xs">
      <span className="label">Game style for homework</span>
      <select
        value={value ?? ""}
        onChange={(e) => void change(e.target.value)}
        disabled={saving}
        className="field"
      >
        {!value && <option value="">Pick one…</option>}
        {GAME_STYLES.map((style) => (
          <option key={style.id} value={style.id}>
            {style.name}
          </option>
        ))}
      </select>
    </label>
  );
}
