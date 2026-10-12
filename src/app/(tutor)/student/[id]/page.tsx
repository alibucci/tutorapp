import Link from "next/link";
import { notFound } from "next/navigation";
import { FamilyLogin } from "@/components/FamilyLogin";
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
              {lessons.length} {lessons.length === 1 ? "lesson" : "lessons"} · since{" "}
              {DATE.format(new Date(since))}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <GameStylePicker studentId={student.id} value={student.gameStyle} />
          <span className="tag tag-quiet min-h-9 px-3 t-small">
            {student.recordingConsent ? "Both voices recorded" : "Tutor's voice only"}
          </span>
        </div>
      </header>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start">
      <div className="stack-lg min-w-0">
      <section className="space-y-3">
        <h2 className="t-title">Working on</h2>
        <SkillList skills={student.skills} />
      </section>

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
                        {lesson.mode === "classroom" ? "in the room" : "online"}
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
      />

      <ReportsPanel student={student} reports={reports} />

      <details className="card group">
        <summary className="flex cursor-pointer items-center justify-between gap-4 p-4 font-semibold">
          Private links, no password
          <span className="t-small t-muted font-normal group-open:hidden">Show</span>
        </summary>
        <div className="border-t border-line p-4">
          <ShareLinks student={student} />
        </div>
      </details>
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
  if (lesson.summary) return { text: "Send homework", tone: "text-warn", href: `${base}/review#homework` };
  if (lesson.debrief.length) return { text: "Review", tone: "text-warn", href: `${base}/review` };
  // Not recorded, or interrupted: back to the recorder. Ended without a
  // debrief: straight to the debrief.
  if (!lesson.endedAt) {
    return { text: lesson.startedAt ? "Finish lesson" : "Not recorded", tone: "text-warn", href: base };
  }
  return { text: "Debrief", tone: "text-warn", href: `${base}/debrief` };
}
