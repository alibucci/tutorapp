import Link from "next/link";
import { notFound } from "next/navigation";
import { ReportsPanel } from "@/components/ReportsPanel";
import { ShareLinks } from "@/components/ShareLinks";
import { SkillList } from "@/components/SkillList";
import { studentFor } from "@/lib/access";
import { listLessons, listReports } from "@/lib/store";

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

  return (
    <div className="stack-lg">
      <header>
        <h1 className="t-display">
          {student.name}
        </h1>
        <p className="t-body t-muted mt-2">
          {lessons.length} lessons &middot; {student.skills.length} topics
          tracked
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="t-subtitle">Topics</h2>
        <SkillList skills={student.skills} />
      </section>

      <ReportsPanel student={student} reports={reports} />

      <ShareLinks student={student} />

      {lessons.length > 0 && (
        <section className="space-y-3">
          <h2 className="t-subtitle">Lessons</h2>
          <ul className="divide-y divide-line card">
            {lessons.map((lesson) => (
              <li key={lesson.id}>
                <Link
                  href={`/lesson/${lesson.id}/review`}
                  className="flex items-baseline justify-between gap-4 px-4 py-3"
                >
                  <span className="min-w-0">
                    <span className="block truncate t-small">
                      {lesson.title}
                    </span>
                    <span className="block t-caption t-muted">
                      {lesson.createdAt.slice(0, 10)}
                    </span>
                  </span>
                  <span className="shrink-0 t-caption t-muted">
                    {lesson.skillsAppliedAt
                      ? "applied"
                      : lesson.summary
                        ? "needs review"
                        : "no summary"}
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
