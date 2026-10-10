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
    <label className="inline-flex">
      <span className="sr-only">Game style for homework</span>
      <select
        value={value ?? ""}
        onChange={(e) => void change(e.target.value)}
        disabled={saving}
        className="min-h-9 cursor-pointer rounded-[var(--radius)] border border-line-strong bg-surface px-3 t-small font-semibold"
      >
        {!value && <option value="">Pick a game style…</option>}
        {GAME_STYLES.map((style) => (
          <option key={style.id} value={style.id}>
            Homework: {style.name}
          </option>
        ))}
      </select>
    </label>
  );
}
