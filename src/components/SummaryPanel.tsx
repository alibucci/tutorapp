"use client";

import { api } from "@/lib/api";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { Lesson } from "@/lib/types";

export function SummaryPanel({ lesson }: { lesson: Lesson }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);
  const summary = lesson.summary;
  const canGenerate = lesson.transcript.length > 0 || lesson.debrief.length > 0;

  async function generate() {
    setBusy(true);
    setError(null);
    setSeconds(0);
    const result = await api(
      `/api/lessons/${lesson.id}/summary`,
      { method: "POST" },
      "Could not write the summary. Try again.",
    );
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  // A tick while the model works, so a wait of half a minute reads as progress
  // rather than as a frozen page.
  useEffect(() => {
    if (!busy) return;
    const timer = window.setInterval(() => setSeconds((n) => n + 1), 1000);
    return () => window.clearInterval(timer);
  }, [busy]);

  // Nobody should have to press a button to get the obvious next thing. Once
  // per page load, so a failure does not turn into a retry loop - and only
  // once the debrief is in: a summary written without the tutor's own view
  // is the weaker one, and generating it early spends the call for nothing.
  const started = useRef(false);
  useEffect(() => {
    if (started.current || summary || lesson.debrief.length === 0) return;
    started.current = true;
    void generate();
    // generate is recreated every render; this is a one-shot on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-4">
        <h2 className="t-title">Summary</h2>
        <button
          onClick={() => void generate()}
          disabled={busy || !canGenerate}
          className="btn btn-ghost btn-sm"
        >
          {busy ? `Writing… ${seconds}s` : summary ? "Regenerate" : "Generate"}
        </button>
      </div>

      {error && <p className="note note-warn">{error}</p>}

      {!summary ? (
        <p className="empty">
          {!canGenerate
            ? "Record a lesson or a debrief first."
            : lesson.debrief.length === 0 && !busy
              ? "Written once your debrief is in - it carries what the transcript cannot."
            : busy
              ? "Reading the lesson and writing the summary and the parent message. This usually takes 15–30 seconds."
              : "Nothing generated yet."}
        </p>
      ) : (
        <div className="card space-y-5 p-5">
          <p className="text-[1.125rem] font-medium leading-snug">{summary.whatMatters}</p>

          {summary.covered.length > 0 && (
            <Block title="Covered">
              <ul className="flex flex-wrap gap-1.5">
                {summary.covered.map((item, i) => (
                  <li key={i} className="rounded-lg bg-sunken px-2.5 py-1 t-small font-medium">
                    {item}
                  </li>
                ))}
              </ul>
            </Block>
          )}

          {summary.struggles.length > 0 && (
            <Block title="Struggled" tone="text-warn">
              <Notes notes={summary.struggles} />
            </Block>
          )}

          {summary.nextLesson.length > 0 && (
            <Block title="Next lesson">
              <List items={summary.nextLesson} />
            </Block>
          )}

          <details className="group border-t border-line pt-4">
            <summary className="cursor-pointer font-semibold text-accent">
              <span className="group-open:hidden">Full summary</span>
              <span className="hidden group-open:inline">Less</span>
            </summary>
            <div className="mt-4 space-y-5">
              <Block title="Improved">
                <Notes notes={summary.improvements} />
              </Block>
              <Block title="Teaching signals">
                {summary.teachingSignals.length === 0 ? (
                  <Empty />
                ) : (
                  <ul className="space-y-3">
                    {summary.teachingSignals.map((s, i) => (
                      <li key={i}>
                        <span className="block font-semibold">{s.concept}</span>
                        <span className="block t-small t-muted">&ldquo;{s.correction}&rdquo;</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Block>
              <p className="t-caption t-muted">
                {summary.model} &middot; {new Date(summary.generatedAt).toLocaleString()}
              </p>
            </div>
          </details>
        </div>
      )}
    </section>
  );
}

function Block({
  title,
  tone = "",
  children,
}: {
  title: string;
  tone?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h3 className={`t-eyebrow mb-2 ${tone}`}>{title}</h3>
      {children}
    </div>
  );
}

function List({ items }: { items: string[] }) {
  if (items.length === 0) return <Empty />;
  return (
    <ul className="list-disc space-y-1 pl-5">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

function Notes({ notes }: { notes: { what: string; evidence: string }[] }) {
  if (notes.length === 0) return <Empty />;
  return (
    <ul className="space-y-3">
      {notes.map((n, i) => (
        <li key={i}>
          <span className="block font-semibold">{n.what}</span>
          <span className="block t-small t-muted">&ldquo;{n.evidence}&rdquo;</span>
        </li>
      ))}
    </ul>
  );
}

function Empty() {
  return <p className="t-small t-muted">Nothing in the source for this.</p>;
}
