import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { gameStyle } from "@/lib/gameStyles";
import { listLessons, listStudents } from "@/lib/store";

export const dynamic = "force-dynamic";

/**
 * One card per student - the student is what a tutor thinks in, not the
 * lesson. Each card carries the one thing that changes what the tutor does
 * for that child: what still needs work, and which game their homework uses.
 */
export default async function Home() {
  const session = await requireSession();
  const students = await listStudents(session.id);
  const lessons = await listLessons();

  const lastLesson = new Map<string, string>();
  const waiting = new Map<string, number>();
  for (const lesson of lessons) {
    if (!lastLesson.has(lesson.studentId)) {
      lastLesson.set(lesson.studentId, lesson.createdAt.slice(0, 10));
    }
    if (lesson.homework?.answers && !lesson.skillsAppliedAt) {
      waiting.set(lesson.studentId, (waiting.get(lesson.studentId) ?? 0) + 1);
    }
  }

  return (
    <div className="stack-lg">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="t-display">Students</h1>
          <p className="t-body t-muted mt-2">
            One-to-one lessons. Tap a student for their topics, homework and
            sign-ins.
          </p>
        </div>
        <Link href="/student/new" className="btn btn-quiet">
          Add student
        </Link>
      </section>

      {students.length === 0 ? (
        <div className="empty p-10 text-center">
          <p className="t-small t-muted">No students yet.</p>
          <Link href="/student/new" className="mt-4 inline-block btn btn-primary">
            Add your first student
          </Link>
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {students.map((student) => {
            const needsWork = student.skills.filter(
              (s) => s.status === "struggling",
            ).length;
            return (
              <li key={student.id}>
                <Link
                  href={`/student/${student.id}`}
                  className="card card-press flex h-full flex-col p-4"
                >
                  <span
                    aria-hidden
                    className="grid h-12 w-12 place-items-center rounded-[var(--radius)] bg-accent-soft t-title text-accent"
                  >
                    {student.name.trim().charAt(0).toUpperCase()}
                  </span>
                  <span className="mt-3 block truncate t-subtitle">
                    {student.name}
                  </span>
                  <span className="mt-1 block t-caption t-muted">
                    {student.gameStyle
                      ? gameStyle(student.gameStyle).name
                      : "No game style yet"}
                  </span>
                  <span className="mt-auto pt-3 block t-caption t-muted">
                    {lastLesson.get(student.id)
                      ? `Last lesson ${lastLesson.get(student.id)}`
                      : "No lessons yet"}
                    {needsWork > 0 && ` · ${needsWork} to work on`}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
