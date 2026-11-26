import { notFound, redirect } from "next/navigation";
import { LessonMaterials, LessonRecorder } from "@/components/LessonRecorder";
import { lessonFor } from "@/lib/access";
import { getStudent } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function LessonPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ start?: string }>;
}) {
  const { id } = await params;
  // Pressed "Start lesson" on a plan card: the recording starts by itself.
  const autoStart = (await searchParams).start === "1";
  const found = await lessonFor(id);
  if (!found) notFound();
  const { lesson, student } = found;
  // A note about a child is five spoken answers, not a recorded lesson. An old
  // link here used to open the lesson recorder on it, with the browser's
  // recogniser and whatever language the note was made in.
  if (lesson.kind === "intro") redirect(`/lesson/${id}/debrief`);
  if (lesson.kind === "practice") redirect(`/lesson/${id}/review`);
  const who =
    lesson.kind === "group"
      ? (await Promise.all((lesson.groupStudentIds ?? []).map((sid) => getStudent(sid))))
          .map((s) => s?.name)
          .filter(Boolean)
          .join(", ")
      : student?.name;

  return (
    <div className="stack-lg">
      <header>
        <h1 className="t-display">{lesson.title}</h1>
        <p className="t-body t-muted mt-2">
          {who ?? "unknown student"} &middot;{" "}
          {lesson.mode === "classroom" ? "physical classroom" : "online lesson"}
        </p>
      </header>

      {lesson.planCard && !lesson.endedAt && (
        <LessonMaterials planId={lesson.planCard.planId} cardId={lesson.planCard.cardId} />
      )}

      <LessonRecorder lesson={lesson} autoStart={autoStart} />
    </div>
  );
}
