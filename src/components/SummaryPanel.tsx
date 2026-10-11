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
        <div className="card space-y-6 p-5">
          {/* The one line that matters most, set apart from everything else. */}
          <div className="flex gap-3 rounded-[var(--radius)] bg-accent-soft p-4">
            <span className="mt-0.5 shrink-0 text-accent">
              <TargetIcon />
            </span>
            <div>
              <p className="t-eyebrow text-accent!">What matters</p>
              <p className="mt-1.5 text-[1.0625rem] font-medium leading-snug">
                {summary.whatMatters}
              </p>
            </div>
          </div>

          {summary.covered.length > 0 && (
            <Block title="Covered" tone="done" icon={<CheckIcon />}>
              <ul className="flex flex-wrap gap-1.5">
                {summary.covered.map((item, i) => (
                  <li
                    key={i}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-live-soft px-2.5 py-1 t-small font-medium text-live"
                  >
                    <CheckIcon size={14} />
                    {item}
                  </li>
                ))}
              </ul>
            </Block>
          )}

          {summary.struggles.length > 0 && (
            <Block title="Struggled" tone="warn" icon={<AlertIcon />}>
              <Notes notes={summary.struggles} tone="warn" />
            </Block>
          )}

          {summary.nextLesson.length > 0 && (
            <Block title="Next lesson" tone="info" icon={<ArrowIcon />}>
              <ol className="space-y-2.5">
                {summary.nextLesson.map((item, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-info text-xs font-bold text-white">
                      {i + 1}
                    </span>
                    <span className="pt-0.5">{item}</span>
                  </li>
                ))}
              </ol>
            </Block>
          )}

          <details className="group border-t border-line pt-4">
            <summary className="cursor-pointer font-semibold text-accent">
              <span className="group-open:hidden">Full summary</span>
              <span className="hidden group-open:inline">Less</span>
            </summary>
            <div className="mt-5 space-y-6">
              <Block title="Improved" tone="done" icon={<TrendIcon />}>
                <Notes notes={summary.improvements} tone="done" />
              </Block>
              <Block title="Teaching signals" tone="info" icon={<BulbIcon />}>
                <Notes
                  notes={summary.teachingSignals.map((s) => ({
                    what: s.concept,
                    evidence: s.correction,
                  }))}
                  tone="info"
                />
              </Block>
              <p className="t-caption t-muted">
                {summary.model} &middot;{" "}
                {new Date(summary.generatedAt).toLocaleString("en-GB")}
              </p>
            </div>
          </details>
        </div>
      )}
    </section>
  );
}

type Tone = "done" | "warn" | "info";

/** Each colour carries the meaning it has everywhere else in the app. */
const TONE: Record<Tone, { tile: string; text: string; card: string }> = {
  // `!`: .t-eyebrow sets its own grey, and it sits outside Tailwind's layer.
  done: { tile: "bg-live-soft text-live", text: "text-live!", card: "bg-live-soft" },
  warn: { tile: "bg-warn-soft text-warn", text: "text-warn!", card: "bg-warn-soft" },
  info: { tile: "bg-info-soft text-info", text: "text-info!", card: "bg-info-soft" },
};

function Block({
  title,
  tone,
  icon,
  children,
}: {
  title: string;
  tone: Tone;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h3 className="mb-3 flex items-center gap-2.5">
        <span className={`grid h-7 w-7 place-items-center rounded-lg ${TONE[tone].tile}`}>
          {icon}
        </span>
        <span className={`t-eyebrow ${TONE[tone].text}`}>{title}</span>
      </h3>
      {children}
    </section>
  );
}

/** One tinted card per point, so points read as separate things. */
function Notes({
  notes,
  tone,
}: {
  notes: { what: string; evidence: string }[];
  tone: Tone;
}) {
  if (notes.length === 0) return <Empty />;
  return (
    <ul className="space-y-2">
      {notes.map((n, i) => (
        <li key={i} className={`rounded-[var(--radius)] px-4 py-3 ${TONE[tone].card}`}>
          <span className="block font-semibold">{n.what}</span>
          {n.evidence && (
            <span className="mt-1 block t-small italic t-muted">&ldquo;{n.evidence}&rdquo;</span>
          )}
        </li>
      ))}
    </ul>
  );
}

function Empty() {
  return <p className="t-small t-muted">Nothing in the source for this.</p>;
}

function Icon({ children, size = 16 }: { children: React.ReactNode; size?: number }) {
  return (
    <svg aria-hidden width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}
const TargetIcon = () => (
  <Icon size={20}>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="5" />
    <circle cx="12" cy="12" r="1" />
  </Icon>
);
const CheckIcon = ({ size }: { size?: number }) => (
  <Icon size={size}>
    <path d="M20 6 9 17l-5-5" />
  </Icon>
);
const AlertIcon = () => (
  <Icon>
    <path d="M12 9v4M12 17h.01" />
    <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
  </Icon>
);
const ArrowIcon = () => (
  <Icon>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Icon>
);
const TrendIcon = () => (
  <Icon>
    <path d="m3 17 6-6 4 4 8-8M15 7h6v6" />
  </Icon>
);
const BulbIcon = () => (
  <Icon>
    <path d="M9 18h6M10 22h4" />
    <path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.3h6c0-1 .4-1.8 1-2.3A7 7 0 0 0 12 2z" />
  </Icon>
);
