import Link from "next/link";
import { BriefPanel } from "@/components/BriefPanel";
import type { LearningOverview } from "@/lib/overview";
import type { LearningBrief } from "@/lib/types";

const DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });

/** The learner's practice between lessons at a glance, with the brief. */
export function LearningOverviewCard({
  studentId,
  overview: o,
  brief,
}: {
  studentId: string;
  overview: LearningOverview;
  brief?: LearningBrief;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="t-title">Continuous learning</h2>
        <Link href={`/student/${studentId}/pilot`} className="t-small underline">
          Pilot report
        </Link>
      </div>
      <div className="card card-pad stack-sm">
        <p className="t-small">
          {o.status}
          {o.next && <span className="t-muted"> Next: {o.next}.</span>}
        </p>

        {o.waiting.length > 0 && (
          <div className="note note-warn t-small">
            <b>Waiting for you:</b>{" "}
            {o.waiting.map((w, i) => (
              <span key={w.id}>
                {i > 0 && ", "}
                <Link className="underline" href={`/lesson/${w.id}/review#homework`}>
                  {w.title}
                </Link>
              </span>
            ))}{" "}
            - check and send.
          </div>
        )}
        {o.failed.length > 0 && (
          <div className="note note-warn t-small">
            <b>Could not be made:</b> {o.failed.map((e) => `${DATE.format(new Date(`${e.slot}T12:00:00Z`))} - ${e.reason}`).join(" · ")}
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <p className="t-eyebrow">Being done now</p>
            {o.current.length ? (
              <ul className="t-small mt-1 space-y-0.5">
                {o.current.map((c) => (
                  <li key={c.id}>
                    <Link className="underline" href={`/lesson/${c.id}/review#homework`}>
                      {c.title}
                    </Link>{" "}
                    <span className="t-muted">· {c.played} of {c.games} games</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="t-small t-muted mt-1">Nothing open.</p>
            )}
          </div>
          <div>
            <p className="t-eyebrow">Done lately</p>
            {o.done.length ? (
              <ul className="t-small mt-1 space-y-0.5">
                {o.done.map((d) => (
                  <li key={d.id}>
                    <Link className="underline" href={`/lesson/${d.id}/review#homework`}>
                      {d.title}
                    </Link>
                    {d.score && <span className="t-muted"> · {d.score}</span>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="t-small t-muted mt-1">No Smart Review finished yet.</p>
            )}
          </div>
        </div>

        {o.recommended.length > 0 && (
          <div>
            <p className="t-eyebrow">Worth going over</p>
            <ul className="t-small mt-1 space-y-0.5">
              {o.recommended.map((r) => (
                <li key={r.topic}>
                  <span className="font-medium">{r.topic}</span> <span className="t-muted">- {r.why}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {o.heldBack.length > 0 && (
          <div>
            <p className="t-eyebrow">Held back or skipped</p>
            <ul className="t-small mt-1 space-y-0.5">
              {o.heldBack.map((e) => (
                <li key={`${e.slot}-${e.at}`}>
                  {DATE.format(new Date(`${e.slot}T12:00:00Z`))} <span className="t-muted">- {e.reason}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      <div className="card card-pad">
        <BriefPanel studentId={studentId} brief={brief} stale={o.briefStale} />
      </div>
    </section>
  );
}
