import Link from "next/link";
import { notFound } from "next/navigation";
import { gameStyle } from "@/lib/gameStyles";
import { getTutor, listLessons, listStudents } from "@/lib/store";

export const dynamic = "force-dynamic";

export const metadata = { title: "Tutor" };

/** What one tutor has: their students and how much each has been taught. */
export default async function TutorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const tutor = await getTutor(id);
  if (!tutor) notFound();

  const [students, lessons] = await Promise.all([listStudents(id), listLessons()]);

  return (
    <div className="stack-lg">
      <header>
        <Link href="/admin" className="t-small t-muted">
          ← Tutors
        </Link>
        <h1 className="t-display mt-2">{tutor.name}</h1>
        <p className="t-body t-muted mt-2">
          {tutor.email}
          {!tutor.active && " · suspended"}
          {tutor.mustChangePassword && " · password not changed yet"}
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="t-subtitle">Students ({students.length})</h2>
        {students.length === 0 ? (
          <p className="empty p-6 t-small t-muted">No students yet.</p>
        ) : (
          <ul className="divide-y divide-line card">
            {students.map((student) => {
              const theirs = lessons.filter((l) => l.studentId === student.id);
              return (
                <li
                  key={student.id}
                  className="flex items-baseline justify-between gap-4 px-4 py-3"
                >
                  <span className="min-w-0">
                    <span className="block truncate t-small font-medium">
                      {student.name}
                    </span>
                    <span className="block t-caption t-muted">
                      {student.gameStyle
                        ? gameStyle(student.gameStyle).name
                        : "no game style"}
                      {" · "}
                      {student.logins?.student ? "has sign-in" : "no sign-in"}
                      {student.recordingConsent ? " · consent on file" : ""}
                    </span>
                  </span>
                  <span className="shrink-0 t-caption t-muted">
                    {theirs.length} {theirs.length === 1 ? "lesson" : "lessons"}
                    {theirs[0] && ` · last ${theirs[0].createdAt.slice(0, 10)}`}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
