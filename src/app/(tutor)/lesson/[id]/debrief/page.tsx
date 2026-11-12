import { notFound, redirect } from "next/navigation";
import { ChangeStudent } from "@/components/ChangeStudent";
import { DebriefRecorder } from "@/components/DebriefRecorder";
import { lessonFor } from "@/lib/access";
import { moveOptions } from "@/lib/moveLesson";
import { getStudent } from "@/lib/store";
import { groupPrompts, type Student } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function DebriefPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const found = await lessonFor(id);
  if (!found) notFound();
  const { lesson, student } = found;
  if (lesson.kind === "practice") redirect(`/lesson/${id}/review`);
  const isGroup = lesson.kind === "group";
  const students = isGroup
    ? (await Promise.all((lesson.groupStudentIds ?? []).map((id) => getStudent(id)))).filter(
        (s): s is Student => Boolean(s),
      )
    : [];

  return (
    <div className="stack-lg">
      <header>
        <h1 className="t-display">
          {lesson.kind === "intro" ? "About this child" : "Debrief"}
        </h1>
        <p className="t-body t-muted mt-2">
          {lesson.kind === "intro"
            ? "Five short questions. Everything else is built from this."
            : isGroup
              ? `${lesson.title} · three short questions on each child, then you're done.`
              : `${lesson.title} · five short prompts, then you're done.`}
        </p>
      </header>

      {/* The moment a tutor notices: the recording has just ended. */}
      {!isGroup && <ChangeStudent {...await moveOptions(lesson, student)} />}

      <DebriefRecorder lesson={lesson} prompts={isGroup ? groupPrompts(students) : undefined} />
    </div>
  );
}
