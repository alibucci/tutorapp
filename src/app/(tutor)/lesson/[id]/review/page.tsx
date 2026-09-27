import Link from "next/link";
import { notFound } from "next/navigation";
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

  return (
    <div className="stack-lg">
      <header>
        <h1 className="t-display">{lesson.title}</h1>
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
            Audio from these points on may be missing, or recorded without the
            classroom gate. Listen before trusting the summary.
          </p>
        </section>
      )}

      {typeof lesson.summary?.studentWordShare === "number" && (
        <section className="card p-5">
          <h2 className="t-subtitle">How much they spoke</h2>
          <p className="mt-2 t-num t-display">
            {Math.round(lesson.summary.studentWordShare * 100)}%
          </p>
          <p className="t-caption t-muted mt-1">
            Share of the words in this lesson that were the student&rsquo;s. A
            low number usually means the lesson was a lecture.
          </p>
        </section>
      )}

      <SummaryPanel lesson={lesson} />

      <SkillReview lesson={lesson} />

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
          {lesson.debriefAudioFile && (
            <audio
              controls
              preload="none"
              src={`/api/lessons/${lesson.id}/audio?kind=debrief`}
              className="w-full"
            />
          )}
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
          {lesson.audioFile && (
            <audio
              controls
              preload="none"
              src={`/api/lessons/${lesson.id}/audio`}
              className="w-full"
            />
          )}
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
