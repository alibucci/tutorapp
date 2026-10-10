import { notFound } from "next/navigation";
import { HomeworkGame } from "@/components/HomeworkGame";
import { homeworkFor } from "@/lib/access";
import { gameStyle } from "@/lib/gameStyles";

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
  if (!found || found.tutor || !homework?.imageFile) notFound();

  const image = `/api/lessons/${lessonId}/homework/image?f=${homework.imageFile}${
    linkKey ? `&key=${encodeURIComponent(linkKey)}` : ""
  }`;
  return (
    <HomeworkGame
      lessonId={lessonId}
      imageSrc={image}
      focus={homework.focus}
      style={gameStyle(found.student.gameStyle)}
      linkKey={linkKey}
      backHref={backHref}
      answered={homework.answers}
    />
  );
}
