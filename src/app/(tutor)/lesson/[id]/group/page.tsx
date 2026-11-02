import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { GroupSplit } from "@/components/GroupSplit";
import { ChevronRight } from "@/components/ui";
import { lessonFor } from "@/lib/access";
import { getLesson, getStudent } from "@/lib/store";
import type { Lesson, Student } from "@/lib/types";

export const dynamic = "force-dynamic";

export const metadata = { title: "Who said what" };

export default async function GroupPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const found = await lessonFor(id);
  if (!found) notFound();
  const { lesson } = found;
  if (lesson.kind !== "group") redirect(`/lesson/${id}/review`);
  // Not at this step yet: back to where the lesson actually is.
  if (!lesson.endedAt) redirect(`/lesson/${id}`);
  if (lesson.debrief.length === 0) redirect(`/lesson/${id}/debrief`);

  const students = (
    await Promise.all((lesson.groupStudentIds ?? []).map((sid) => getStudent(sid)))
  ).filter((s): s is Student => Boolean(s));

  if (lesson.groupLessonIds) {
    const made = (
      await Promise.all(lesson.groupLessonIds.map((lid) => getLesson(lid)))
    ).filter((l): l is Lesson => Boolean(l));
    return (
      <div className="stack-lg">
        <header>
          <h1 className="t-display">{lesson.title}</h1>
          <p className="t-body t-muted mt-2">
            Group lesson. Each child has their own summary, games and parent
            message - check and send them one at a time.
          </p>
        </header>
        <ul className="card rows">
          {made.map((child) => (
            <li key={child.id}>
              <Link href={`/lesson/${child.id}/review`} className="row row-link py-3.5">
                <span className="min-w-0 flex-1 truncate font-semibold">
                  {students.find((s) => s.id === child.studentId)?.name ?? "Student"}
                </span>
                <span className="t-small t-muted">
                  {child.homework?.sentAt ? "Homework sent" : "To review"}
                </span>
                <span className="t-muted">
                  <ChevronRight />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <GroupSplit
      lessonId={lesson.id}
      title={lesson.title}
      students={students.map((s) => ({ id: s.id, name: s.name }))}
      transcript={lesson.transcript}
      hasTranscript={lesson.capture === "both"}
    />
  );
}
