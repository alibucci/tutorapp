import { notFound } from "next/navigation";
import { ChangeStudent } from "@/components/ChangeStudent";
import { DebriefRecorder } from "@/components/DebriefRecorder";
import { lessonFor } from "@/lib/access";
import { moveOptions } from "@/lib/moveLesson";

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

  return (
    <div className="stack-lg">
      <header>
        <h1 className="t-display">
          {lesson.kind === "intro" ? "About this child" : "Debrief"}
        </h1>
        <p className="t-body t-muted mt-2">
          {lesson.kind === "intro"
            ? "Five short questions. Everything else is built from this."
            : `${lesson.title} · five short prompts, then you're done.`}
        </p>
      </header>

      {/* The moment a tutor notices: the recording has just ended. */}
      <ChangeStudent {...await moveOptions(lesson, student)} />

      <DebriefRecorder lesson={lesson} />
    </div>
  );
}
