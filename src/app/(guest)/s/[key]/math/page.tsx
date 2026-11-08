import { notFound } from "next/navigation";
import { MathGame } from "@/components/MathGame";
import { owns } from "@/lib/access";
import { getSession } from "@/lib/auth";
import { styleFor } from "@/lib/gameStyles";
import { makeGame } from "@/lib/math";
import { getStudentByKey } from "@/lib/store";

export const dynamic = "force-dynamic";

export const metadata = { title: "Math practice" };

/** The child's sums, reached by private link. */
export default async function LinkMath({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { key } = await params;
  const student = await getStudentByKey("studentKey", key);
  if (!student?.math?.on) notFound();
  const session = await getSession();
  return (
    <MathGame
      style={styleFor(student)}
      level={student.math.level}
      problems={makeGame(student.math.level)}
      backHref={`/s/${key}`}
      linkKey={key}
      // A tutor opening the child's link is looking, not playing.
      preview={Boolean(session && owns(session, student))}
    />
  );
}
