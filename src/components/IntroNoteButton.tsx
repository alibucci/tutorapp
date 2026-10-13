"use client";

import { api } from "@/lib/api";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { DEFAULT_LANGUAGE, type Lesson } from "@/lib/types";

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
        language: DEFAULT_LANGUAGE,
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
      <button onClick={() => void start()} disabled={busy} className="btn btn-primary">
        {busy ? "Starting…" : "Record a note"}
      </button>
      {error && <p className="note note-warn">{error}</p>}
    </div>
  );
}
