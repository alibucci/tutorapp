"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api";
import { DIFFICULTIES, LEARNING_MAX, cleanLearning } from "@/lib/profile";
import type { LearningDifficulty, LearningPrefs } from "@/lib/types";

/** The programme as the form holds it: every box a string, the switch a tick. */
type Draft = Required<Omit<LearningPrefs, "difficulty" | "approval">> & {
  difficulty: LearningDifficulty;
  approval: boolean;
};

function draftOf(learning: LearningPrefs | undefined): Draft {
  return {
    objectives: learning?.objectives ?? "",
    curriculum: learning?.curriculum ?? "",
    include: learning?.include ?? "",
    avoid: learning?.avoid ?? "",
    requirements: learning?.requirements ?? "",
    difficulty: learning?.difficulty ?? "level",
    approval: Boolean(learning?.approval),
  };
}

/**
 * What the family wants taught, set once. Every lesson plan, slide and
 * homework made from now on reads it, so the tutor does not type the parents'
 * wishes again each time. Separate from the game theme on purpose: the theme
 * is how homework looks, this is what it teaches. Saved on its own, so the
 * "About" form above and this one never overwrite each other.
 */
export function LearningPanel({ studentId, learning }: { studentId: string; learning?: LearningPrefs }) {
  const router = useRouter();
  const [draft, setDraft] = useState(() => draftOf(learning));
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ warn: boolean; text: string } | null>(null);
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

  // Compared as they would be stored, so a stray space is not a change.
  const changed = JSON.stringify(cleanLearning(draft) ?? {}) !== JSON.stringify(cleanLearning(learning) ?? {});

  async function save() {
    setBusy(true);
    setNote(null);
    const result = await api(`/api/students/${studentId}`, { method: "PATCH", json: { learning: draft } });
    setBusy(false);
    if (!result.ok) {
      setNote({ warn: true, text: result.error });
      return;
    }
    setNote({ warn: false, text: "Saved. New lessons and homework follow this; what was already sent stays as it is." });
    router.refresh();
  }

  const box = (
    key: keyof typeof LEARNING_MAX,
    label: string,
    placeholder: string,
    hint?: string,
    rows = 1,
  ) => (
    <label className="block">
      <span className="label">{label}</span>
      {rows > 1 ? (
        <textarea
          value={draft[key]}
          onChange={(e) => set({ [key]: e.target.value })}
          maxLength={LEARNING_MAX[key]}
          rows={rows}
          placeholder={placeholder}
          className="field"
        />
      ) : (
        <input
          value={draft[key]}
          onChange={(e) => set({ [key]: e.target.value })}
          maxLength={LEARNING_MAX[key]}
          placeholder={placeholder}
          className="field"
        />
      )}
      {hint && <span className="hint">{hint}</span>}
    </label>
  );

  return (
    <section className="card space-y-4 p-4">
      <div>
        <h2 className="font-semibold">Learning programme</h2>
        <p className="t-small t-muted mt-1">
          What the family wants taught. Lesson plans and homework follow it, so
          you do not repeat it each time. Leave any box empty.
        </p>
      </div>

      {box("objectives", "Objectives", "e.g. Conversational English, vocabulary, grammar and sentence building", undefined, 2)}
      {box(
        "curriculum",
        "Curriculum focus",
        "e.g. Bible stories",
        "What the content is about. The game theme only changes the look, never this.",
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        {box("include", "Topics to include", "e.g. animals, cooking")}
        {box("avoid", "Topics to avoid", "e.g. scary stories, Halloween", "Never used, in lessons or homework.")}
      </div>
      {box(
        "requirements",
        "Content requirements",
        "e.g. Homework uses only what was covered in lessons; earlier Bible stories may be revised.",
        undefined,
        2,
      )}

      <label className="block">
        <span className="label">Difficulty</span>
        <select
          value={draft.difficulty}
          onChange={(e) => set({ difficulty: e.target.value as LearningDifficulty })}
          className="field"
        >
          {DIFFICULTIES.map((d) => (
            <option key={d.id} value={d.id}>
              {d.label}
            </option>
          ))}
        </select>
        <span className="hint">One step at most, from the level set above.</span>
      </label>

      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={draft.approval}
          onChange={(e) => set({ approval: e.target.checked })}
          className="mt-1 h-5 w-5 shrink-0"
        />
        <span>
          <span className="block font-medium">I approve practice first</span>
          <span className="hint">Practice the app makes by itself waits for your OK before the family gets it.</span>
        </span>
      </label>

      {note && <p className={`note ${note.warn ? "note-warn" : "note-quiet"}`}>{note.text}</p>}

      <button onClick={() => void save()} disabled={busy || !changed} className="btn btn-primary">
        {busy ? "Saving…" : "Save"}
      </button>
    </section>
  );
}
