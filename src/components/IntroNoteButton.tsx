"use client";

import { api } from "@/lib/api";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { DEFAULT_LANGUAGE, LESSON_LANGUAGES, type Lesson } from "@/lib/types";

/**
 * Start a child before you have taught them.
 *
 * Everything downstream - topics, practice games, the note home - is built
 * from a spoken debrief, so a new child needs one even though there has been
 * no lesson. This makes the record and goes straight to the questions.
 */
export function IntroNoteButton({
  studentId,
  studentName,
}: {
  studentId: string;
  studentName: string;
}) {
  const router = useRouter();
  const [language, setLanguage] = useState<string>(DEFAULT_LANGUAGE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setBusy(true);
    setError(null);
    const result = await api<Lesson>("/api/lessons", {
      method: "POST",
      json: {
        title: "First look",
        mode: "online",
        language,
        studentId,
        kind: "intro",
      },
    });
    if (!result.ok) {
      setError(result.error);
      setBusy(false);
      return;
    }
    router.push(`/lesson/${result.data.id}/debrief`);
  }

  return (
    <div className="card card-pad space-y-3">
      <div>
        <p className="font-semibold">Tell the app about {studentName}</p>
        <p className="t-small t-muted mt-1">
          A minute of talking - where they are, what they find hard, what they
          like. From it you get their topics, their practice games and a note
          home, without waiting for the first lesson.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          disabled={busy}
          aria-label="Language of the note"
          className="field"
          style={{ width: "auto" }}
        >
          {LESSON_LANGUAGES.map((l) => (
            <option key={l.tag} value={l.tag}>
              {l.label}
            </option>
          ))}
        </select>
        <button onClick={() => void start()} disabled={busy} className="btn btn-primary">
          {busy ? "Starting…" : "Record a note"}
        </button>
      </div>
      {error && <p className="note note-warn">{error}</p>}
    </div>
  );
}
