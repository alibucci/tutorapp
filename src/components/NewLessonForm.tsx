"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  DEFAULT_LANGUAGE,
  LESSON_LANGUAGES,
  type Lesson,
  type LessonMode,
  type Student,
} from "@/lib/types";

export function NewLessonForm({ students }: { students: Student[] }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [studentId, setStudentId] = useState(students[0]?.id ?? "");
  const [newName, setNewName] = useState("");
  const [consentFrom, setConsentFrom] = useState("");
  const [mode, setMode] = useState<LessonMode>("online");
  const [language, setLanguage] = useState<string>(DEFAULT_LANGUAGE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addingStudent = studentId === "" || students.length === 0;
  const selected = students.find((s) => s.id === studentId);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    try {
      let id = studentId;

      if (addingStudent) {
        const res = await fetch("/api/students", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: newName, consentFrom }),
        });
        if (!res.ok) throw new Error("Could not create the student.");
        id = ((await res.json()) as Student).id;
      }

      const res = await fetch("/api/lessons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, mode, language, studentId: id }),
      });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error ?? "Could not create the lesson.");
      }

      const lesson = (await res.json()) as Lesson;
      router.push(`/lesson/${lesson.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="max-w-lg space-y-6">
      <div>
        <h1 className="t-display">New lesson</h1>
        <p className="t-body t-muted mt-2">
          Thirty seconds of setup, then nothing else until the lesson ends.
        </p>
      </div>

      <label className="block">
        <span className="label">Student</span>
        <select
          value={studentId}
          onChange={(e) => setStudentId(e.target.value)}
          className="field"
        >
          {students.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
          <option value="">+ New student</option>
        </select>
        <span className="hint">
          One student per lesson. Attribution from tutor-only audio is only
          trustworthy one-to-one.
        </span>
      </label>

      {addingStudent ? (
        <>
          <label className="block">
            <span className="label">Name</span>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Aigerim"
              required
              className="field"
            />
          </label>

          <label className="block">
            <span className="label">
              Consent to record the child
            </span>
            <input
              value={consentFrom}
              onChange={(e) => setConsentFrom(e.target.value)}
              placeholder="Parent's name, or leave blank"
              className="field"
            />
            <span className="hint">
              Fill this in only once you hold written consent. Left blank, only
              your own voice is ever recorded.
            </span>
          </label>
        </>
      ) : (
        selected && (
          <p
            className={`note ${
              selected.recordingConsent ? "note-accent" : "note-quiet"
            }`}
          >
            {selected.recordingConsent
              ? `Both voices will be recorded - consent from ${selected.recordingConsent.grantedBy}.`
              : "No consent on file, so only your voice will be recorded."}
          </p>
        )
      )}

      <label className="block">
        <span className="label">Lesson</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Fractions - Tuesday"
          required
          className="field"
        />
      </label>

      <label className="block">
        <span className="label">
          Language of the lesson
        </span>
        <select
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          className="field"
        >
          {LESSON_LANGUAGES.map((l) => (
            <option key={l.tag} value={l.tag}>
              {l.label}
            </option>
          ))}
        </select>
        <span className="hint">
          Set this correctly - everything downstream is built on the transcript.
          Browser support varies by language; check the live transcript moves
          before you rely on a lesson.
        </span>
      </label>

      <fieldset className="space-y-2">
        <legend className="label">Setting</legend>
        {[
          {
            value: "online" as const,
            label: "Online lesson",
            hint: "Your mic is already isolated. Nothing extra to configure.",
          },
          {
            value: "classroom" as const,
            label: "Physical classroom",
            hint: "Adds an on-device gate so only near-mic speech is written to disk.",
          },
        ].map((option) => (
          <label
            key={option.value}
            className={`choice ${mode === option.value ? "choice-on" : ""}`}
          >
            <input
              type="radio"
              name="mode"
              className="mt-1"
              checked={mode === option.value}
              onChange={() => setMode(option.value)}
            />
            <span>
              <span className="block t-small font-medium">{option.label}</span>
              <span className="block t-caption t-muted">{option.hint}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {error && <p className="note note-warn">{error}</p>}

      <button
        type="submit"
        disabled={busy}
        className="btn btn-primary"
      >
        {busy ? "Creating..." : "Set up the mic"}
      </button>
    </form>
  );
}
