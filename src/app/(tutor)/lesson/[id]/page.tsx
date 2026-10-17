import { notFound, redirect } from "next/navigation";
import { LessonRecorder } from "@/components/LessonRecorder";
import { lessonFor } from "@/lib/access";

export const dynamic = "force-dynamic";

export default async function LessonPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const found = await lessonFor(id);
  if (!found) notFound();
  const { lesson, student } = found;
  // A note about a child is five spoken answers, not a recorded lesson. An old
  // link here used to open the lesson recorder on it, with the browser's
  // recogniser and whatever language the note was made in.
  if (lesson.kind === "intro") redirect(`/lesson/${id}/debrief`);

  return (
    <div className="stack-lg">
      <header>
        <h1 className="t-display">{lesson.title}</h1>
        <p className="t-body t-muted mt-2">
          {student?.name ?? "unknown student"} &middot;{" "}
          {lesson.mode === "classroom" ? "physical classroom" : "online lesson"}
        </p>
      </header>

      <LessonRecorder lesson={lesson} />
    </div>
  );
}
