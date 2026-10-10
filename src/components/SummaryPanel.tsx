"use client";

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
    const res = await fetch(`/api/lessons/${lesson.id}/summary`, {
      method: "POST",
    });
    if (!res.ok) {
      const body = (await res.json()) as { error?: string };
      setError(body.error ?? "Could not generate the summary.");
      setBusy(false);
      return;
    }
    router.refresh();
    setBusy(false);
  }

  // A tick while the model works, so a wait of half a minute reads as progress
  // rather than as a frozen page.
  useEffect(() => {
    if (!busy) return;
    const timer = window.setInterval(() => setSeconds((n) => n + 1), 1000);
    return () => window.clearInterval(timer);
  }, [busy]);

  // Nobody should have to press a button to get the obvious next thing. Once
  // per page load, so a failure does not turn into a retry loop.
  const started = useRef(false);
  useEffect(() => {
    if (started.current || summary || !canGenerate) return;
    started.current = true;
    void generate();
    // generate is recreated every render; this is a one-shot on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section className="space-y-4">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="t-subtitle">Summary</h2>
        <button
          onClick={() => void generate()}
          disabled={busy || !canGenerate}
          className="btn btn-quiet btn-sm"
        >
          {busy ? `Writing… ${seconds}s` : summary ? "Regenerate" : "Generate"}
        </button>
      </div>

      {error && <p className="note note-warn">{error}</p>}

      {!summary ? (
        <p className="empty p-6 t-small t-muted">
          {!canGenerate
            ? "Record a lesson or a debrief first."
            : busy
              ? "Reading the lesson and writing the summary and the parent message. This usually takes 15–30 seconds."
              : "Nothing generated yet."}
        </p>
      ) : (
        <div className="space-y-5 card p-5">
          <Block title="What matters">
            <p className="t-body">{summary.whatMatters}</p>
          </Block>

          <Block title="Covered">
            <List items={summary.covered} />
          </Block>

          <Block title="Struggled">
            <Notes notes={summary.struggles} />
          </Block>

          <Block title="Improved">
            <Notes notes={summary.improvements} />
          </Block>

          <Block title="Teaching signals">
            {summary.teachingSignals.length === 0 ? (
              <Empty />
            ) : (
              <ul className="space-y-2 t-small">
                {summary.teachingSignals.map((s, i) => (
                  <li key={i}>
                    <span className="font-medium">{s.concept}</span>
                    <span className="block text-muted">
                      &ldquo;{s.correction}&rdquo;
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Block>

          <Block title="Next lesson">
            <List items={summary.nextLesson} />
          </Block>

          <p className="t-caption t-muted mt-5 border-t border-line pt-3">
            {summary.model} &middot;{" "}
            {new Date(summary.generatedAt).toLocaleString()}
          </p>
        </div>
      )}
    </section>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-1.5 t-eyebrow">
        {title}
      </h3>
      {children}
    </div>
  );
}

function List({ items }: { items: string[] }) {
  if (items.length === 0) return <Empty />;
  return (
    <ul className="list-disc space-y-1 pl-5 t-small">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

function Notes({ notes }: { notes: { what: string; evidence: string }[] }) {
  if (notes.length === 0) return <Empty />;
  return (
    <ul className="space-y-2 t-small">
      {notes.map((n, i) => (
        <li key={i}>
          {n.what}
          <span className="block text-muted">&ldquo;{n.evidence}&rdquo;</span>
        </li>
      ))}
    </ul>
  );
}

function Empty() {
  return <p className="t-small t-muted">Nothing in the source for this.</p>;
}
