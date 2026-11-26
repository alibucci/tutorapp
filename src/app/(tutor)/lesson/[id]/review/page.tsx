import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChangeStudent } from "@/components/ChangeStudent";
import { HomeworkPanel } from "@/components/HomeworkPanel";
import { redoState } from "@/lib/redo";
import { ParentMessagePanel } from "@/components/ParentMessagePanel";
import { PlanCheckPanel } from "@/components/PlanCheckPanel";
import { within } from "@/lib/planShared";
import { SkillReview } from "@/components/SkillReview";
import { SummaryPanel } from "@/components/SummaryPanel";
import { ChevronLeft } from "@/components/ui";
import { lessonFor } from "@/lib/access";
import { moveOptions } from "@/lib/moveLesson";
import { styleFor } from "@/lib/gameStyles";
import { hasParent } from "@/lib/profile";
import { canDrawPictures } from "@/lib/imageGen";
import { PROGRAMME, cardById, christianityOpenTo } from "@/lib/christianity";
import { storyStatus } from "@/lib/programmes";
import { StoryNext } from "@/components/StoryNext";
import { listReports } from "@/lib/store";
import { INTERRUPTION_LABEL, promptLabel } from "@/lib/types";

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
  const { lesson, student, session } = found;
  // The shared recording has no summary of its own: each child's lesson does.
  if (lesson.kind === "group") redirect(`/lesson/${id}/group`);
  // Extra homework has no lesson behind it: no summary, debrief or parent
  // message - only the games.
  const practice = lesson.kind === "practice";
  // A Bible story from the programme: the story the system picked.
  const story = cardById(lesson.module?.storyId);
  const recapOf = cardById(lesson.module?.reviewOf);

  // The end of a lesson is where the next Bible story is checked and sent.
  const bible =
    !practice && !student.archivedAt && (await christianityOpenTo(session)) ? await storyStatus(student) : null;

  const homeworkSent = Boolean(lesson.homework?.sentAt);
  const messageSent = Boolean(lesson.parentMessage?.copiedAt);
  // Green when done, amber on the first one still waiting.
  // An adult has no parent to write to: two steps, not three.
  const parent = hasParent(student);
  const steps = [
    { href: "#summary", label: "Summary", done: Boolean(lesson.summary) },
    { href: "#homework", label: "Homework", done: homeworkSent },
    ...(parent ? [{ href: "#parent", label: "Parent", done: messageSent }] : []),
  ];
  const next = steps.findIndex((s) => !s.done);
  // The parent's page shows approved weekly notes and nothing else: before the
  // first one, a link would open an empty page. An archived child's links no
  // longer open at all.
  const parentLink =
    parent && !student.archivedAt
      ? {
          key: student.parentKey,
          ready: (await listReports(student.id)).some((r) => r.approvedAt),
        }
      : undefined;

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
            {story ? `Christianity · ${story.reference}` : practice ? (lesson.review ? "Smart Review" : "Extra homework") : lesson.mode === "classroom" ? "In the room" : "Online"}
            {!practice && lesson.recordedMs
              ? ` · ${Math.max(1, Math.round(lesson.recordedMs / 60000))} min`
              : ""}
            {` · ${DATE.format(new Date(lesson.createdAt))}`}
          </p>
        </span>
      </header>

      {!practice && <ChangeStudent {...await moveOptions(lesson, student)} />}

      {!practice && (
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
      )}

      {!practice && lesson.debrief.length === 0 && (
        <section className="card card-pad flex flex-wrap items-center justify-between gap-3">
          <span>
            <span className="block font-semibold">No debrief yet</span>
            <span className="block t-small t-muted">
              Sixty seconds of what you think. The summary is written from it.
            </span>
          </span>
          <Link href={`/lesson/${lesson.id}/debrief`} className="btn btn-primary">
            Record the debrief
          </Link>
        </section>
      )}

      {!practice && lesson.interruptions?.length > 0 && (
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
      {story ? (
        <section className="card card-pad space-y-2">
          <p className="t-eyebrow">Christianity · story {story.order + 1} of {PROGRAMME.length}</p>
          <p className="font-semibold">
            {story.title} <span className="font-normal t-muted">· {story.reference}</span>
          </p>
          <p className="t-small">
            Today&rsquo;s rule: <span className="font-semibold">{story.value.rule}</span>
          </p>
          {recapOf && <p className="t-small t-muted">Starts with a short recap of &ldquo;{recapOf.title}&rdquo;, which was not passed.</p>}
          {!story.approved && (
            <p className="note note-warn">
              This story&rsquo;s card is not approved yet. You can preview it, but it cannot be sent.
            </p>
          )}
        </section>
      ) : practice && lesson.review ? (
        <section className="card card-pad space-y-2">
          <p className="t-eyebrow">
            Why this Smart Review · about {lesson.review.minutes} min · {lesson.review.by === "schedule" ? "made by the schedule" : "made by you"}
          </p>
          <ul className="list-disc pl-5 space-y-1 t-small">
            {lesson.review.reason.split(" · ").map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          {lesson.review.comment && <p className="t-small t-muted">You asked: {lesson.review.comment}</p>}
          <p className="hint">New questions on these skills, from what the lessons covered. Nothing reaches the child until it is sent.</p>
        </section>
      ) : practice ? (
        <section className="card card-pad space-y-1">
          <p className="t-eyebrow">What you asked for</p>
          <p>{lesson.request}</p>
        </section>
      ) : (
      <div className="stack-lg min-w-0">
      <div id="summary" className="scroll-mt-20">
        {/* Keyed by student: after a move, each starts again from nothing. */}
        <SummaryPanel key={student.id} lesson={lesson} />
      </div>
      {/* A child's lesson from a group: the plan was checked once, on the group lesson. */}
      {lesson.planCard && !lesson.groupId && lesson.summary &&
        (lesson.planCheck || within(lesson.summary.generatedAt, 3 * 60_000)) && (
        <PlanCheckPanel lessonId={lesson.id} check={lesson.planCheck} planHref={`/plans/${lesson.planCard.planId}`} />
      )}

      <SkillReview key={student.id} lesson={lesson} studentName={student?.name} />
      </div>
      )}

      <div className="stack-lg min-w-0">
      {(lesson.summary || practice) && (
        <HomeworkPanel
          key={student.id}
          lesson={lesson}
          studentName={student?.name ?? "the student"}
          studentKey={student?.studentKey ?? ""}
          styleName={styleFor(student).name}
          canDraw={canDrawPictures()}
          redo={redoState(student, lesson.id)}
        />
      )}

      {bible && (
        <StoryNext studentId={student.id} studentName={student.name} studentKey={student.studentKey} status={bible} />
      )}

      {parent && (!practice || story) && (
        <div id="parent" className="scroll-mt-20">
          <ParentMessagePanel key={student.id} lesson={lesson} parentLink={parentLink} />
        </div>
      )}
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
                  {promptLabel(answer.promptId)}
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

    </div>
  );
}

function formatMs(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = String(Math.floor(total / 60)).padStart(2, "0");
  const s = String(total % 60).padStart(2, "0");
  return `${m}:${s}`;
}
