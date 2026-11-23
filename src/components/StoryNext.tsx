"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { StoryStatus } from "@/lib/programmes";

const DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });

/**
 * The Bible story where the tutor decides about it: at the end of a lesson,
 * and on the learner's page. It says what is really going on - ready to
 * check, with the child, being written, failed - and the story is only ever
 * sent from here, after the tutor has had the chance to look.
 */
export function StoryNext({
  studentId,
  studentName,
  studentKey,
  status,
  framed = true,
}: {
  studentId: string;
  studentName: string;
  studentKey: string;
  status: StoryStatus;
  /** Its own card (the lesson page), or inside another one (the student page). */
  framed?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"send" | "prepare" | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const writing = busy === "prepare" || status.state === "building";

  useEffect(() => {
    if (!writing) return;
    const timer = window.setInterval(() => setSeconds((n) => n + 1), 1000);
    return () => window.clearInterval(timer);
  }, [writing]);

  // Written on the server in the background (after the child finished the
  // last one): look again every few seconds until it is there.
  useEffect(() => {
    if (status.state !== "building" || busy) return;
    const timer = window.setInterval(() => router.refresh(), 4000);
    return () => window.clearInterval(timer);
  }, [status.state, busy, router]);

  async function prepare() {
    setSeconds(0);
    setBusy("prepare");
    setError(null);
    const result = await api(
      `/api/students/${studentId}/christianity`,
      { method: "POST" },
      "Could not write the story. Try again.",
    );
    setBusy(null);
    if (!result.ok) setError(result.error);
    router.refresh();
  }

  async function send(lessonId: string) {
    setBusy("send");
    setError(null);
    const result = await api(
      `/api/lessons/${lessonId}/homework`,
      { method: "PATCH", json: { send: true } },
      "Could not send it. Try again.",
    );
    setBusy(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  let body: React.ReactNode;
  if (writing) {
    body = (
      <div role="status" aria-live="polite" className="rounded-[var(--radius)] bg-accent-soft p-4 space-y-1">
        <p className="flex items-center gap-3 font-semibold">
          <span className="spinner shrink-0" aria-hidden />
          Writing the story{"next" in status && status.next ? `: ${status.next}` : ""}…
          <span className="ml-auto t-small tabular-nums text-accent">{seconds}s</span>
        </p>
        <p className="t-small">
          Usually under a minute. Nothing goes to {studentName} until you send it.
        </p>
      </div>
    );
  } else if (status.state === "ready") {
    body = (
      <div className="space-y-3">
        <div>
          <p className="t-small t-muted">Ready to check</p>
          <p className="font-semibold">
            {status.title}
            {status.reference && <span className="font-normal t-muted"> · {status.reference}</span>}
          </p>
          {status.recap && <p className="t-small t-muted">Starts with a short recap of &ldquo;{status.recap}&rdquo;.</p>}
        </div>
        <a
          href={`/s/${studentKey}/quest/${status.lessonId}`}
          target="_blank"
          rel="noopener"
          className="btn btn-soft btn-block"
        >
          <EyeIcon />
          Overview of the homework
        </a>
        {status.approved ? (
          <button
            onClick={() => void send(status.lessonId)}
            disabled={busy !== null}
            className="btn btn-primary btn-block"
          >
            {busy === "send" ? "Sending…" : `Send to ${studentName}`}
          </button>
        ) : (
          <p className="note note-warn">This story&rsquo;s card is not approved yet, so it cannot be sent.</p>
        )}
        <p className="hint">
          Not sent until you tap Send.{" "}
          <Link href={`/lesson/${status.lessonId}/review#homework`} className="font-semibold text-accent">
            Open it
          </Link>{" "}
          to read the story or write it again.
        </p>
      </div>
    );
  } else if (status.state === "with") {
    body = (
      <div className="space-y-1">
        <p className="t-small t-muted">With {studentName} now</p>
        <p className="font-semibold">{status.title}</p>
        <p className="t-small t-muted">
          Sent {DATE.format(new Date(status.sentAt))} · not finished yet ·{" "}
          <Link href={`/lesson/${status.lessonId}/review#homework`} className="font-semibold text-accent">
            See it
          </Link>
        </p>
        {status.next && (
          <p className="hint">
            Next: {status.next}. It is written when {studentName} finishes this one, and waits for you
            to send it.
          </p>
        )}
      </div>
    );
  } else if (status.state === "failed") {
    body = (
      <div className="space-y-2">
        <p className="note note-warn">
          The next story ({status.next}) could not be written: {status.error}
        </p>
        <button onClick={() => void prepare()} disabled={busy !== null} className="btn btn-soft btn-block">
          Try again
        </button>
      </div>
    );
  } else if (status.state === "due") {
    body = (
      <div className="space-y-2">
        <p className="t-small">
          Next: <span className="font-semibold">{status.next}</span>
          {status.reference && <span className="t-muted"> · {status.reference}</span>}
        </p>
        <button onClick={() => void prepare()} disabled={busy !== null} className="btn btn-soft btn-block">
          Write it
        </button>
        <p className="hint">You check it before it goes to {studentName}.</p>
      </div>
    );
  } else {
    body = <p className="t-small t-muted">{studentName} has had every story in the programme.</p>;
  }

  const content = (
    <>
      {body}
      {error && <p className="note note-warn">{error}</p>}
    </>
  );
  if (!framed) return <div className="space-y-2">{content}</div>;
  return (
    <section id="story" className="card card-pad space-y-3 scroll-mt-20">
      <div className="flex items-center justify-between gap-3">
        <p className="font-semibold">Bible story for {studentName}</p>
        {status.state === "ready" && <span className="tag tag-warn">Not sent</span>}
        {status.state === "with" && <span className="tag tag-info">Sent · waiting</span>}
      </div>
      {content}
    </section>
  );
}

function EyeIcon() {
  return (
    <svg aria-hidden width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
