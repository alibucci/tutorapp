"use client";

import { ABOUT_MAX, GOALS, LEVELS, PLAIN_FROM_AGE } from "@/lib/profile";
import type { StudentProfile } from "@/lib/types";

/** The profile as a form holds it: every field a string or a tick. */
export type ProfileDraft = {
  age: string;
  level: string;
  goal: string;
  about: string;
  shortTasks: boolean;
  look: string;
};

export function draftOf(profile: StudentProfile | undefined): ProfileDraft {
  return {
    age: profile?.age ? String(profile.age) : "",
    level: profile?.level ?? "",
    goal: profile?.goal ?? "",
    about: profile?.about ?? "",
    shortTasks: Boolean(profile?.shortTasks),
    look: profile?.look ?? "",
  };
}

/** What the server is sent: empty fields left out. */
export function profileOf(draft: ProfileDraft) {
  return {
    ...(draft.age.trim() && { age: Number(draft.age) }),
    ...(draft.level && { level: draft.level }),
    ...(draft.goal && { goal: draft.goal }),
    ...(draft.about.trim() && { about: draft.about.trim() }),
    ...(draft.shortTasks && { shortTasks: true }),
    ...(draft.look && { look: draft.look }),
  };
}

/** Age, level, goal and a line about the learner. Shared by add and edit. */
export function ProfileFields({
  draft,
  onChange,
}: {
  draft: ProfileDraft;
  onChange: (next: ProfileDraft) => void;
}) {
  const set = (patch: Partial<ProfileDraft>) => onChange({ ...draft, ...patch });
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="block">
          <span className="label">Age</span>
          <input
            type="number"
            inputMode="numeric"
            min={3}
            max={99}
            value={draft.age}
            onChange={(e) => set({ age: e.target.value })}
            className="field"
          />
        </label>
        <label className="block">
          <span className="label">English level</span>
          <select value={draft.level} onChange={(e) => set({ level: e.target.value })} className="field">
            <option value="">Not sure</option>
            {LEVELS.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="label">Goal</span>
          <select value={draft.goal} onChange={(e) => set({ goal: e.target.value })} className="field">
            <option value="">School English</option>
            {GOALS.filter((g) => g.id !== "school").map((g) => (
              <option key={g.id} value={g.id}>
                {g.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="block">
        <span className="label">About them</span>
        <textarea
          value={draft.about}
          onChange={(e) => set({ about: e.target.value })}
          maxLength={ABOUT_MAX}
          rows={3}
          placeholder="e.g. A couple, 25, run their own restaurant in Shanghai. Love football and cooking."
          className="field"
        />
        <span className="hint">
          Interests and their world - the homework is set there. No health
          details or diagnoses: use the switch below instead.
        </span>
      </label>

      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={draft.shortTasks}
          onChange={(e) => set({ shortTasks: e.target.checked })}
          className="mt-1 h-5 w-5 shrink-0"
        />
        <span>
          <span className="block font-medium">Short tasks</span>
          <span className="hint">Fewer, shorter tasks, and a change of activity more often.</span>
        </span>
      </label>

      <label className="block">
        <span className="label">Look</span>
        <select value={draft.look} onChange={(e) => set({ look: e.target.value })} className="field">
          <option value="">Automatic: a game under {PLAIN_FROM_AGE}, plain from {PLAIN_FROM_AGE}</option>
          <option value="game">A game, with points</option>
          <option value="plain">Plain, no game</option>
        </select>
      </label>
    </div>
  );
}
