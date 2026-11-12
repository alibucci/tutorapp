import Link from "next/link";
import { ExtraHomework } from "@/components/ExtraHomework";
import { canScoreVoice } from "@/lib/pronounce";
import { hasVoiceConsent, mayScoreVoice } from "@/lib/voice";
import { notFound } from "next/navigation";
import { ArchiveStudent } from "@/components/ArchiveStudent";
import { FamilyLogin } from "@/components/FamilyLogin";
import { IntroNoteButton } from "@/components/IntroNoteButton";
import { MathPanel } from "@/components/MathPanel";
import { ProfilePanel } from "@/components/ProfilePanel";
import { styleFor } from "@/lib/gameStyles";
import { hasParent } from "@/lib/profile";
import { MathSummary } from "@/components/MathSummary";
import { GameStylePicker } from "@/components/GameStylePicker";
import { ReportsPanel } from "@/components/ReportsPanel";
import { ShareLinks } from "@/components/ShareLinks";
import { SkillList } from "@/components/SkillList";
import { Avatar, ChevronLeft, ChevronRight } from "@/components/ui";
import { studentFor } from "@/lib/access";
import { homeworkDone } from "@/lib/homework";
import { listLessons, listReports } from "@/lib/store";
import type { Lesson } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function StudentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const found = await studentFor(id);
  if (!found) notFound();
  const { student } = found;

  const [lessons, reports] = await Promise.all([
    listLessons(id),
    listReports(id),
  ]);

  const since = lessons.at(-1)?.createdAt ?? student.createdAt;
  // Extra homework sits in the list, but it is not a lesson.
  const taught = lessons.filter((l) => l.kind !== "practice").length;

  return (
    <div className="stack-lg">
      <header className="space-y-4">
        <Link
          href="/"
          aria-label="Back to students"
          className="-ml-3 grid h-11 w-11 place-items-center rounded-[var(--radius)]"
        >
          <ChevronLeft />
        </Link>
        <div className="flex items-center gap-4">
          <Avatar name={student.name} size="lg" />
          <div className="min-w-0">
            <h1 className="t-display truncate">{student.name}</h1>
            <p className="t-small t-muted mt-1">
              {taught} {taught === 1 ? "lesson" : "lessons"} · since{" "}
              {DATE.format(new Date(since))}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <GameStylePicker studentId={student.id} value={student.gameStyle} ownName={student.customStyle?.name} />
          <span className="tag tag-quiet min-h-9 px-3 t-small">
            {student.recordingConsent ? "Both voices recorded" : "Tutor's voice only"}
          </span>
          {canScoreVoice() && mayScoreVoice(student) && (
            // The learner decides this on their own screen; the tutor only sees it.
            <span
              className="tag tag-quiet min-h-9 px-3 t-small"
              title="Asked on their homework screen the first time they say a line. Only they can switch it on or off."
            >
              {hasVoiceConsent(student) ? "Pronunciation checks on" : "Pronunciation checks not agreed"}
            </span>
          )}
        </div>
        {student.archivedAt && (
          <ArchiveStudent studentId={student.id} studentName={student.name} archived />
        )}
      </header>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start">
      <div className="stack-lg min-w-0">
      <ProfilePanel
        // Saved values in the key: a save from elsewhere starts the form again.
        key={JSON.stringify(student.profile ?? {})}
        studentId={student.id}
        studentName={student.name}
        profile={student.profile}
        themeName={styleFor(student).name}
        ownTheme={student.gameStyle === "custom" && Boolean(student.customStyle)}
      />

      <section className="space-y-3">
        <h2 className="t-title">Working on</h2>
        <SkillList skills={student.skills} />
      </section>

      {/* A child with no lessons yet has nothing to build from. This is how
          they get a starting point without waiting for the first lesson. */}
      {lessons.length === 0 && !student.archivedAt && (
        <IntroNoteButton studentId={student.id} studentName={student.name} />
      )}

      {lessons.length > 0 && (
        <section className="space-y-3">
          <h2 className="t-title">Lessons</h2>
          <ul className="card rows">
            {lessons.map((lesson) => {
              const next = nextStep(lesson);
              return (
                <li key={lesson.id}>
                  <Link
                    href={next.href}
                    className="row row-link py-3.5"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{lesson.title}</span>
                      <span className="block t-small t-muted">
                        {DATE.format(new Date(lesson.createdAt))} ·{" "}
                        {lesson.kind === "practice"
                          ? "extra homework"
                          : lesson.mode === "classroom"
                            ? "in the room"
                            : "online"}
                      </span>
                    </span>
                    <span className={`shrink-0 t-small font-semibold ${next.tone}`}>
                      {next.text}
                    </span>
                    <span className="t-muted">
                      <ChevronRight />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      </div>

      <div className="stack-lg min-w-0">
      <FamilyLogin
        studentId={student.id}
        studentName={student.name}
        username={student.login?.username}
        parent={hasParent(student)}
      />

      {!student.archivedAt && <ExtraHomework studentId={student.id} studentName={student.name} />}

      <MathPanel
        key={`${student.math?.on}-${student.math?.level}`}
        studentId={student.id}
        studentName={student.name}
        on={Boolean(student.math?.on)}
        level={student.math?.level ?? 1}
      >
        {student.math && student.math.games.length > 0 && <MathSummary math={student.math} />}
      </MathPanel>

      {hasParent(student) && <ReportsPanel student={student} reports={reports} />}

      <details className="card group">
        <summary className="flex cursor-pointer items-center justify-between gap-4 p-4 font-semibold">
          Private links, no password
          <span className="t-small t-muted font-normal group-open:hidden">Show</span>
        </summary>
        <div className="border-t border-line p-4">
          <ShareLinks student={student} parent={hasParent(student)} />
        </div>
      </details>

      {!student.archivedAt && (
        <ArchiveStudent studentId={student.id} studentName={student.name} archived={false} />
      )}
      </div>
      </div>
    </div>
  );
}

const DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });

/** What this lesson is still waiting for, in the app's colours. */
function nextStep(lesson: Lesson): { text: string; tone: string; href: string } {
  const base = `/lesson/${lesson.id}`;
  if (homeworkDone(lesson.homework)) {
    return { text: "Homework done", tone: "text-live", href: `${base}/review` };
  }
  if (lesson.homework?.sentAt) return { text: "Homework sent", tone: "t-muted", href: `${base}/review` };
  if (lesson.kind === "practice") return { text: "Send homework", tone: "text-warn", href: `${base}/review#homework` };
  if (lesson.summary) return { text: "Send homework", tone: "text-warn", href: `${base}/review#homework` };
  if (lesson.debrief.length) return { text: "Review", tone: "text-warn", href: `${base}/review` };
  // A note about the child has no lesson to record, only the questions.
  if (lesson.kind === "intro") return { text: "Record note", tone: "text-warn", href: `${base}/debrief` };
  // Not recorded, or interrupted: back to the recorder. Ended without a
  // debrief: straight to the debrief.
  if (!lesson.endedAt) {
    return { text: lesson.startedAt ? "Finish lesson" : "Not recorded", tone: "text-warn", href: base };
  }
  return { text: "Debrief", tone: "text-warn", href: `${base}/debrief` };
}
