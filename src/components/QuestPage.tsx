import { notFound } from "next/navigation";
import { HomeworkGame } from "@/components/HomeworkGame";
import { homeworkFor } from "@/lib/access";
import { gameStyle } from "@/lib/gameStyles";
import { homeworkDone, homeworkImageUrl } from "@/lib/homework";

/** One homework, for whichever way the child got in. */
export async function QuestPage({
  lessonId,
  linkKey,
  backHref,
}: {
  lessonId: string;
  linkKey?: string;
  backHref: string;
}) {
  const found = await homeworkFor(lessonId, linkKey ?? null);
  const homework = found?.lesson.homework;
  // Homework is games, a picture, or both - but it has to be something.
  if (!found || found.tutor || !homework) notFound();
  if (!homework.imageFile && !homework.exercises?.length) notFound();

  return (
    <HomeworkGame
      lessonId={lessonId}
      imageSrc={homeworkImageUrl(found.lesson, linkKey) ?? undefined}
      focus={homework.focus}
      style={gameStyle(found.student.gameStyle)}
      linkKey={linkKey}
      backHref={backHref}
      answered={homework.answers}
      exercises={homework.exercises}
      finished={homeworkDone(homework)}
      results={homework.results}
    />
  );
}
