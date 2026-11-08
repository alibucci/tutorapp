"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ProfileFields, draftOf, profileOf } from "@/components/ProfileFields";
import { api } from "@/lib/api";
import { EXERCISE_LABEL, type StudentProfile } from "@/lib/types";
import { formatsFor, hasParent, lookFor } from "@/lib/profile";

/**
 * Who the learner is, editable any time. What it leads to is spelled out under
 * the form, so the tutor sees the effect before the next homework, not after.
 * Homework already sent keeps the look and tasks it went out with.
 */
export function ProfilePanel({
  studentId,
  studentName,
  profile,
  themeName,
  ownTheme,
}: {
  studentId: string;
  studentName: string;
  profile?: StudentProfile;
  themeName: string;
  /** Whether the theme in use is the one made for this learner. */
  ownTheme: boolean;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState(() => draftOf(profile));
  const [busy, setBusy] = useState<"save" | "theme" | null>(null);
  const [note, setNote] = useState<{ warn: boolean; text: string } | null>(null);

  const next = profileOf(draft);
  const changed = JSON.stringify(next) !== JSON.stringify(profileOf(draftOf(profile)));
  const look = lookFor(next as StudentProfile);
  const formats = formatsFor(next as StudentProfile);

  async function save(body: Record<string, unknown>, what: "save" | "theme") {
    setBusy(what);
    setNote(null);
    const result = await api<{ themeError?: string }>(`/api/students/${studentId}`, {
      method: "PATCH",
      json: body,
    });
    setBusy(null);
    if (!result.ok) {
      setNote({ warn: true, text: result.error });
      return;
    }
    setNote(
      result.data.themeError
        ? { warn: true, text: result.data.themeError }
        : { warn: false, text: "Saved. The next homework follows this." },
    );
    router.refresh();
  }

  return (
    <section className="card space-y-4 p-4">
      <div>
        <h2 className="font-semibold">About {studentName}</h2>
        <p className="t-small t-muted mt-1">
          The homework fits itself to this. Change it whenever you like - only
          new homework changes.
        </p>
      </div>

      <ProfileFields draft={draft} onChange={setDraft} />

      <div className="rounded-[var(--radius)] bg-sunken p-3 t-small space-y-1">
        <p>
          <span className="font-semibold">Look:</span>{" "}
          {look === "plain" ? "plain, no points or quests" : "a game"} · {themeName}
          {ownTheme && " (made for them)"}
        </p>
        <p>
          <span className="font-semibold">Tasks:</span>{" "}
          {formats.map((k) => EXERCISE_LABEL[k]).join(", ")}
          {draft.shortTasks && " - short"}
        </p>
        {!hasParent({ profile: next as StudentProfile }) && (
          <p className="t-muted">An adult: no parent message after lessons.</p>
        )}
      </div>

      {note && <p className={`note ${note.warn ? "note-warn" : "note-quiet"}`}>{note.text}</p>}

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => void save({ profile: next }, "save")}
          disabled={busy !== null || !changed}
          className="btn btn-primary"
        >
          {busy === "save" ? (draft.about.trim() ? "Saving and making a theme…" : "Saving…") : "Save"}
        </button>
        {profile?.about && !changed && (
          <button
            onClick={() => void save({ remakeTheme: true }, "theme")}
            disabled={busy !== null}
            className="btn btn-quiet"
          >
            {busy === "theme" ? "Making a theme…" : ownTheme ? "Make a new theme" : "Make a theme from this"}
          </button>
        )}
      </div>
    </section>
  );
}
