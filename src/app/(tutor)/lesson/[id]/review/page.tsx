import Link from "next/link";
import { notFound } from "next/navigation";
import { HomeworkPanel } from "@/components/HomeworkPanel";
import { ParentMessagePanel } from "@/components/ParentMessagePanel";
import { SkillReview } from "@/components/SkillReview";
import { SummaryPanel } from "@/components/SummaryPanel";
import { lessonFor } from "@/lib/access";
import { DEBRIEF_PROMPTS, INTERRUPTION_LABEL } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const found = await lessonFor(id);
  if (!found) notFound();
  const { lesson, student } = found;

  const steps = [
    { href: "#summary", label: "Summary", done: Boolean(lesson.summary) },
    { href: "#homework", label: "Homework", done: Boolean(lesson.homework?.sentAt) },
    { href: "#parent", label: "Message to parent", done: Boolean(lesson.parentMessage) },
  ];

  return (
    <div className="stack-lg">
      <header>
        {student && (
          <Link href={`/student/${student.id}`} className="t-small t-muted">
            ← {student.name}
          </Link>
        )}
        <h1 className="t-display mt-2">{lesson.title}</h1>
        <p className="t-body t-muted mt-2">
          {student ? (
          <Link href={`/student/${student.id}`} className="underline">
            {student.name}
          </Link>
        ) : (
          "unknown student"
        )}{" "}
        &middot;{" "}
          {lesson.mode === "classroom" ? "physical classroom" : "online lesson"}
          {lesson.recordedMs
            ? ` · ${Math.round(lesson.recordedMs / 60000)} min captured`
            : ""}
        </p>
      </header>

      {lesson.interruptions?.length > 0 && (
        <section className="card card-accent card-pad t-small">
          <h2 className="font-medium">The recording was interrupted</h2>
          <ul className="mt-1.5 space-y-0.5 t-caption">
            {lesson.interruptions.map((i, n) => (
              <li key={n}>
                {new Date(i.at).toLocaleTimeString()} &mdash;{" "}
                {INTERRUPTION_LABEL[i.kind]}
              </li>
            ))}
          </ul>
          <p className="mt-2 t-caption">
            The transcript from these points on may be missing. Check it before
            trusting the summary.
          </p>
        </section>
      )}

      {/* After a lesson: summary, then homework, then the note home. */}
      <nav aria-label="Steps" className="flex flex-wrap items-center gap-2 t-small">
        {steps.map((step, i) => (
          <span key={step.href} className="flex items-center gap-2">
            {i > 0 && <span aria-hidden className="t-muted">→</span>}
            <a href={step.href} className={`pill ${step.done ? "pill-done" : ""}`}>
              {i + 1}. {step.label}
            </a>
          </span>
        ))}
      </nav>

      <div id="summary" className="scroll-mt-6">
        <SummaryPanel lesson={lesson} />
      </div>

      <SkillReview lesson={lesson} />

      {lesson.summary && (
        <HomeworkPanel lesson={lesson} studentName={student?.name ?? "the student"} />
      )}

      <div id="parent" className="scroll-mt-6">
        <ParentMessagePanel lesson={lesson} />
      </div>

      {lesson.debrief.length > 0 && (
        <section className="space-y-3">
          <h2 className="t-subtitle">Debrief</h2>
          <dl className="divide-y divide-line card">
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
          <div className="max-h-96 space-y-2 overflow-y-auto card p-4 t-small">
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
