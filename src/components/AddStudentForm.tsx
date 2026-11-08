"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ProfileFields, draftOf, profileOf } from "@/components/ProfileFields";
import { GAME_STYLES } from "@/lib/gameStyles";
import type { Student } from "@/lib/types";

export function AddStudentForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  /** Empty: their own theme from the description, or the default without one. */
  const [style, setStyle] = useState("");
  const [profile, setProfile] = useState(() => draftOf(undefined));
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
      body: JSON.stringify({
        name,
        consentFrom,
        profile: profileOf(profile),
        ...(style && { gameStyle: style }),
      }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
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

      <ProfileFields draft={profile} onChange={setProfile} />

      <label className="block">
        <span className="label">Theme for homework</span>
        <select
          value={style}
          onChange={(e) => setStyle(e.target.value)}
          className="field"
        >
          <option value="">Made for them, from &ldquo;About them&rdquo;</option>
          {GAME_STYLES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <span className="hint">
          Leave it to the description and the app draws up a theme from their
          interests. Without a description, a ready-made one is used.
        </span>
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
        {busy ? (style || !profile.about.trim() ? "Adding…" : "Adding and making a theme…") : "Add student"}
      </button>
    </form>
  );
}
