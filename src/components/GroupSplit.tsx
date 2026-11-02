"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { Lesson, TranscriptSegment } from "@/lib/types";

const UNKNOWN = "unknown";

function draftKey(id: string) {
  return `tutor-signal:group:${id}`;
}

/**
 * Who said what, suggested from the names the tutor called, for the tutor to
 * check. Nothing reaches a child or a parent from here: this makes each child's
 * own lesson, and those are reviewed and sent one at a time as usual.
 *
 * "Not sure" is a fine answer. Those lines simply go to nobody, and each child's
 * summary still has the tutor's debrief.
 */
export function GroupSplit({
  lessonId,
  title,
  students,
  transcript,
  hasTranscript,
}: {
  lessonId: string;
  title: string;
  students: { id: string; name: string }[];
  transcript: TranscriptSegment[];
  hasTranscript: boolean;
}) {
  const router = useRouter();
  const lines = transcript.length;
  const labelled = transcript.some((seg) => seg.who);
  /** The tutor's corrections, by line. Kept on the phone until they are used. */
  const [edits, setEdits] = useState<Record<number, string>>({});
  const [reading, setReading] = useState(hasTranscript && lines > 0 && !labelled);
  const [busy, setBusy] = useState(false);
  /** Runs the tutor took apart, by their first line. */
  const [opened, setOpened] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const read = useRef(false);
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(draftKey(lessonId));
      // Device storage only exists after hydration, so this cannot be read
      // during render; restoring it here is a one-time sync from outside React.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved) setEdits(JSON.parse(saved) as Record<number, string>);
    } catch {
      // nothing saved, or nothing readable
    }
    if (read.current || !hasTranscript || lines === 0 || labelled) return;
    read.current = true;
    void api(`/api/lessons/${lessonId}/group/labels`, { method: "POST" }, "Could not read the lesson.").then(
      (result) => {
        setReading(false);
        if (!result.ok) setError(result.error);
        router.refresh();
      },
    );
    // one-shot on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Trips to WeChat reload pages on a phone; corrections must survive them.
  useEffect(() => {
    try {
      window.localStorage.setItem(draftKey(lessonId), JSON.stringify(edits));
    } catch {
      // the corrections on screen still count
    }
  }, [edits, lessonId]);

  const whoOf = (i: number) => edits[i] ?? transcript[i]?.who ?? UNKNOWN;
  const counts = new Map<string, number>();
  transcript.forEach((_, i) => counts.set(whoOf(i), (counts.get(whoOf(i)) ?? 0) + 1));
  const unsure = counts.get(UNKNOWN) ?? 0;

  // One person talking in a row is one thing to check, not one per sentence:
  // an hour of lessons is hundreds of lines, and nobody checks hundreds.
  const runs: { lines: number[] }[] = [];
  transcript.forEach((_, i) => {
    const last = runs[runs.length - 1];
    if (last && whoOf(last.lines[0]) === whoOf(i)) last.lines.push(i);
    else runs.push({ lines: [i] });
  });

  async function split() {
    setBusy(true);
    setError(null);
    const result = await api<{ lesson: Lesson }>(
      `/api/lessons/${lessonId}/group/split`,
      { method: "POST", json: { who: transcript.map((_, i) => whoOf(i)) } },
      "Could not make the lessons. Try again.",
    );
    if (!result.ok) {
      setError(result.error);
      setBusy(false);
      return;
    }
    try {
      window.localStorage.removeItem(draftKey(lessonId));
    } catch {
      // nothing to clean
    }
    router.refresh();
  }

  return (
    <div className="stack-lg">
      <header>
        <h1 className="t-display">Who said what</h1>
        <p className="t-body t-muted mt-2">
          {title} ·{" "}
          {hasTranscript && lines > 0
            ? "suggested from the names you called. Fix anything wrong; leave what you are unsure of."
            : "each child's summary comes from what you said about them."}
        </p>
      </header>

      {!hasTranscript && (
        <p className="note note-quiet">
          No transcript for this lesson: not every parent has consented to recording.
        </p>
      )}
      {hasTranscript && lines === 0 && (
        <p className="note note-quiet">No speech was transcribed in this lesson.</p>
      )}

      {reading ? (
        <p className="note note-quiet">Reading who said what…</p>
      ) : (
        lines > 0 && (
          <>
            <p className="t-small t-muted">
              {students.map((s) => `${s.name} ${counts.get(s.id) ?? 0}`).join(" · ")}
              {unsure > 0 && ` · not sure ${unsure}`}
            </p>
            <ul className="card rows">
              {runs.map((run) => {
                const open = run.lines.length > 1 && !opened.has(run.lines[0]);
                const who = whoOf(run.lines[0]);
                const tutor = who === "tutor";
                // Taken apart: one line, one choice.
                const blocks = open || run.lines.length === 1 ? [run.lines] : run.lines.map((i) => [i]);
                return blocks.map((lineIds) => (
                  <li
                    key={lineIds[0]}
                    className={`p-3 ${who === UNKNOWN ? "bg-warn-soft" : ""} ${
                      tutor ? "flex items-start justify-between gap-3" : "space-y-2"
                    }`}
                  >
                    <p className={`min-w-0 t-small ${tutor ? "t-muted" : "font-medium"}`}>
                      {lineIds.map((i) => transcript[i].text).join(" ")}
                    </p>
                    <span className="flex shrink-0 flex-wrap items-center gap-2">
                      <label>
                        <span className="sr-only">Who said this</span>
                        <select
                          value={whoOf(lineIds[0])}
                          onChange={(e) =>
                            setEdits((prev) => ({
                              ...prev,
                              ...Object.fromEntries(lineIds.map((i) => [i, e.target.value])),
                            }))
                          }
                          disabled={busy}
                          className={`cursor-pointer rounded-[var(--radius)] border border-line-strong bg-surface px-2 t-small ${
                            tutor ? "min-h-8 t-muted" : "min-h-9 font-semibold"
                          }`}
                        >
                          <option value="tutor">You</option>
                          {students.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                          <option value={UNKNOWN}>Not sure</option>
                        </select>
                      </label>
                      {open && !tutor && (
                        <button
                          type="button"
                          onClick={() =>
                            setOpened((prev) => new Set(prev).add(run.lines[0]))
                          }
                          className="t-caption t-muted underline"
                        >
                          More than one person?
                        </button>
                      )}
                    </span>
                  </li>
                ));
              })}
            </ul>
          </>
        )
      )}

      {error && <p className="note note-warn">{error}</p>}

      <div className="space-y-2">
        <button
          onClick={() => void split()}
          disabled={busy || reading}
          className="btn btn-primary btn-lg btn-block"
        >
          {busy ? "Making them…" : "Make each child's lesson"}
        </button>
        <p className="hint">
          Nothing goes to a family yet. You check and send each child&rsquo;s one
          at a time. Lines marked &ldquo;Not sure&rdquo; go to nobody.
        </p>
      </div>
    </div>
  );
}
