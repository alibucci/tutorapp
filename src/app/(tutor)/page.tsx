import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { listLessons, listStudents } from "@/lib/store";
import { SKILL_STATUS_LABEL } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await requireSession();
  const students = await listStudents(session.id);
  const mine = new Set(students.map((s) => s.id));
  const lessons = (await listLessons()).filter((l) => mine.has(l.studentId));
  const byStudent = new Map(students.map((s) => [s.id, s]));

  return (
    <div className="stack-lg">
      <section>
        <h1 className="t-display">Students</h1>
        <p className="t-body t-muted mt-2">
          One-to-one lessons. Each student has their own picture of what they
          are working on, and a weekly note for their parent.
        </p>
      </section>

      {students.length === 0 ? (
        <div className="empty p-10 text-center">
          <p className="t-small t-muted">No students yet.</p>
          <Link
            href="/lesson/new"
            className="mt-4 inline-block btn btn-primary"
          >
            Start the first lesson
          </Link>
        </div>
      ) : (
        <ul className="divide-y divide-line card">
          {students.map((student) => {
            const needsWork = student.skills.filter(
              (s) => s.status === "struggling",
            ).length;
            return (
              <li key={student.id}>
                <Link
                  href={`/student/${student.id}`}
                  className="flex items-baseline justify-between gap-4 px-4 py-3.5"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">
                      {student.name}
                    </span>
                    <span className="block truncate t-caption t-muted">
                      {student.skills.length} topics tracked
                      {needsWork > 0 &&
                        ` · ${needsWork} ${SKILL_STATUS_LABEL.struggling}`}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {lessons.length > 0 && (
        <section className="space-y-3">
          <h2 className="t-subtitle">Recent lessons</h2>
          <ul className="divide-y divide-line card">
            {lessons.slice(0, 8).map((lesson) => (
              <li key={lesson.id}>
                <Link
                  href={`/lesson/${lesson.id}/review`}
                  className="flex items-baseline justify-between gap-4 px-4 py-3"
                >
                  <span className="min-w-0">
                    <span className="block truncate t-small">{lesson.title}</span>
                    <span className="block truncate t-caption t-muted">
                      {byStudent.get(lesson.studentId)?.name ?? "unknown"} ·{" "}
                      {lesson.createdAt.slice(0, 10)}
                    </span>
                  </span>
                  <span className="shrink-0 t-caption t-muted">
                    {lesson.skillsAppliedAt
                      ? "applied"
                      : lesson.summary
                        ? "summarised"
                        : lesson.debrief.length
                          ? "debriefed"
                          : "draft"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
