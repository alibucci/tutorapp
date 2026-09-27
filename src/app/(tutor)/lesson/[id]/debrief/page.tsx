import { notFound } from "next/navigation";
import { DebriefRecorder } from "@/components/DebriefRecorder";
import { lessonFor } from "@/lib/access";

export const dynamic = "force-dynamic";

export default async function DebriefPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const found = await lessonFor(id);
  if (!found) notFound();
  const { lesson } = found;

  return (
    <div className="stack-lg">
      <header>
        <h1 className="t-display">
          60-second debrief
        </h1>
        <p className="t-body t-muted mt-2">
          {lesson.title} &middot; five prompts, one minute, then you&rsquo;re done.
        </p>
      </header>

      <DebriefRecorder lesson={lesson} />
    </div>
  );
}
