import Link from "next/link";
import { notFound } from "next/navigation";
import { HomeworkPanel } from "@/components/HomeworkPanel";
import { ParentMessagePanel } from "@/components/ParentMessagePanel";
import { SkillReview } from "@/components/SkillReview";
import { SummaryPanel } from "@/components/SummaryPanel";
import { ChevronLeft } from "@/components/ui";
import { lessonFor } from "@/lib/access";
import { DEBRIEF_PROMPTS, INTERRUPTION_LABEL } from "@/lib/types";

export const dynamic = "force-dynamic";

const DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const found = await lessonFor(id);
  if (!found) notFound();
  const { lesson, student } = found;

  const homeworkSent = Boolean(lesson.homework?.sentAt);
  const messageSent = Boolean(lesson.parentMessage?.copiedAt);
  // Green when done, amber on the first one still waiting.
  const steps = [
    { href: "#summary", label: "Summary", done: Boolean(lesson.summary) },
    { href: "#homework", label: "Homework", done: homeworkSent },
    { href: "#parent", label: "Parent", done: messageSent },
  ];
  const next = steps.findIndex((s) => !s.done);

  return (
    <div className="stack-lg">
      <header className="flex items-center gap-2 -ml-3">
        <Link
          href={student ? `/student/${student.id}` : "/"}
          aria-label={student ? `Back to ${student.name}` : "Back"}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-[var(--radius)]"
        >
          <ChevronLeft />
        </Link>
        <span className="min-w-0">
          <h1 className="t-title truncate">
            {lesson.title}
            {student && <span className="font-normal t-muted"> · {student.name}</span>}
          </h1>
          <p className="t-small t-muted">
            {lesson.mode === "classroom" ? "In the room" : "Online"}
            {lesson.recordedMs
              ? ` · ${Math.max(1, Math.round(lesson.recordedMs / 60000))} min`
              : ""}
            {` · ${DATE.format(new Date(lesson.createdAt))}`}
          </p>
        </span>
      </header>

      <nav
        aria-label="Steps"
        className="steps sticky top-0 z-[5] -mx-4 border-b border-line bg-background px-4 py-3"
      >
        {steps.map((step, i) => (
          <a
            key={step.href}
            href={step.href}
            className={`step ${step.done ? "step-done" : i === next ? "step-next" : ""}`}
          >
            {i + 1} {step.label}
          </a>
        ))}
      </nav>

      {lesson.interruptions?.length > 0 && (
        <section className="note note-warn">
          <p className="font-semibold">The recording was interrupted</p>
          <ul className="mt-1 space-y-0.5">
            {lesson.interruptions.map((i, n) => (
              <li key={n}>
                {new Date(i.at).toLocaleTimeString()} &mdash;{" "}
                {INTERRUPTION_LABEL[i.kind]}
              </li>
            ))}
          </ul>
          <p className="mt-1">
            The transcript from these points on may be missing. Check it before
            trusting the summary.
          </p>
        </section>
      )}

      {/* Phone: one column in step order. Desktop: what to read on the
          left, what to do on the right. */}
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_26rem] lg:items-start">
      <div className="stack-lg min-w-0">
      <div id="summary" className="scroll-mt-20">
        <SummaryPanel lesson={lesson} />
      </div>

      <SkillReview lesson={lesson} />
      </div>

      <div className="stack-lg min-w-0">
      {lesson.summary && (
        <HomeworkPanel lesson={lesson} studentName={student?.name ?? "the student"} />
      )}

      <div id="parent" className="scroll-mt-20">
        <ParentMessagePanel lesson={lesson} />
      </div>
      </div>
      </div>

      {(lesson.debrief.length > 0 || lesson.transcript.length > 0) && (
        <details className="card group">
          <summary className="flex cursor-pointer items-center justify-between gap-4 p-4 font-semibold">
            Debrief and transcript
            <span className="t-small t-muted font-normal group-open:hidden">Show</span>
          </summary>
          <div className="space-y-6 border-t border-line p-4">
      {lesson.debrief.length > 0 && (
        <section className="space-y-3">
          <h2 className="t-subtitle">Debrief</h2>
          <dl className="divide-y divide-line rounded-[var(--radius)] border border-line">
            {lesson.debrief.map((answer) => (
              <div key={answer.promptId} className="px-4 py-3">
                <dt className="t-caption t-muted">
                  {DEBRIEF_PROMPTS.find((p) => p.id === answer.promptId)?.label ??
                    answer.promptId}
                </dt>
                <dd className="mt-1 t-small">{answer.text || "—"}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {lesson.transcript.length > 0 && (
        <section className="space-y-3">
          <h2 className="t-subtitle">
            {lesson.capture === "both" ? "Transcript" : "Tutor transcript"}{" "}
            <span className="font-normal text-muted">
              ({lesson.transcript.length} segments)
            </span>
          </h2>
          <div className="max-h-96 space-y-2 overflow-y-auto rounded-[var(--radius)] border border-line p-4 t-small">
            {lesson.transcript.map((s, i) => (
              <p key={i} className={s.speaker === "student" ? "pl-6" : ""}>
                <span className="mr-2 font-mono t-caption t-muted">
                  {formatMs(s.t)}
                </span>
                {lesson.capture === "both" && (
                  <span className="mr-2 t-caption t-muted">
                    {s.speaker === "student"
                      ? (student?.name ?? "student")
                      : s.speaker === "tutor"
                        ? "you"
                        : "?"}
                  </span>
                )}
                {s.text}
              </p>
            ))}
          </div>
        </section>
      )}

          </div>
        </details>
      )}

      {lesson.debrief.length === 0 && (
        <Link
          href={`/lesson/${lesson.id}/debrief`}
          className="inline-block btn btn-primary"
        >
          Record the debrief
        </Link>
      )}
    </div>
  );
}

function formatMs(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = String(Math.floor(total / 60)).padStart(2, "0");
  const s = String(total % 60).padStart(2, "0");
  return `${m}:${s}`;
}
