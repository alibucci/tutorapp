import { notFound } from "next/navigation";
import { HomeworkGame } from "@/components/HomeworkGame";
import { homeworkFor } from "@/lib/access";
import { cardById } from "@/lib/christianity";
import { fromSent, styleFor } from "@/lib/gameStyles";
import { homeworkDone, homeworkImageUrl } from "@/lib/homework";
import { canScoreVoice } from "@/lib/pronounce";
import { hasVoiceConsent, mayScoreVoice } from "@/lib/voice";

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
  if (!found || !homework) notFound();
  if (!homework.imageFile && !homework.exercises?.length) notFound();
  // A story whose card is not approved is for the tutor's preview only.
  const programme = found.lesson.module;
  if (programme && !found.tutor && !cardById(programme.storyId)?.approved) notFound();

  return (
    <HomeworkGame
      lessonId={lessonId}
      imageSrc={homeworkImageUrl(found.lesson, linkKey) ?? undefined}
      focus={homework.focus}
      // As it was sent; before that, as it would be sent now.
      style={homework.style ? fromSent(homework.style) : styleFor(found.student)}
      linkKey={linkKey}
      backHref={backHref}
      answered={homework.answers}
      exercises={homework.exercises}
      read={homework.read}
      finished={homeworkDone(homework)}
      results={homework.results}
      // A tutor is looking at the child's screen, not doing the homework.
      preview={found.tutor}
      voiceCheck={{
        offered: canScoreVoice() && mayScoreVoice(found.student),
        agreed: hasVoiceConsent(found.student),
      }}
    />
  );
}
