import { notFound } from "next/navigation";
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
