"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { DEFAULT_GAME_STYLE, GAME_STYLES } from "@/lib/gameStyles";
import type { Student } from "@/lib/types";

export function AddStudentForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [style, setStyle] = useState(DEFAULT_GAME_STYLE.id);
  const [consentFrom, setConsentFrom] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/students", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, gameStyle: style, consentFrom }),
    });
    if (!res.ok) {
      const body = (await res.json()) as { error?: string };
      setError(body.error ?? "Could not add the student.");
      setBusy(false);
      return;
    }
    const student = (await res.json()) as Student;
    router.push(`/student/${student.id}`);
  }

  return (
    <form onSubmit={submit} className="card space-y-4 p-5">
      <label className="block">
        <span className="label">Name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="field"
        />
      </label>

      <label className="block">
        <span className="label">Game style for homework</span>
        <select
          value={style}
          onChange={(e) => setStyle(e.target.value)}
          className="field"
        >
          {GAME_STYLES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="label">Recording consent from (optional)</span>
        <input
          value={consentFrom}
          onChange={(e) => setConsentFrom(e.target.value)}
          placeholder="Parent's name, if they signed the consent form"
          className="field"
        />
        <span className="hint">
          Leave empty unless a parent has agreed in writing. Without it only
          your voice is used.
        </span>
      </label>

      {error && <p className="note note-warn">{error}</p>}
      <button disabled={busy} className="btn btn-primary">
        {busy ? "Adding…" : "Add student"}
      </button>
    </form>
  );
}
