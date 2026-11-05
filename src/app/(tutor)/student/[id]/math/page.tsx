import { notFound } from "next/navigation";
import { MathGame } from "@/components/MathGame";
import { studentFor } from "@/lib/access";
import { gameStyle } from "@/lib/gameStyles";
import { makeGame } from "@/lib/math";

export const dynamic = "force-dynamic";

export const metadata = { title: "Math preview" };

/** The tutor trying the child's sums, on or off. Nothing is saved. */
export default async function MathPreview({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const found = await studentFor(id);
  if (!found) notFound();
  const { student } = found;
  const level = student.math?.level ?? 1;
  return (
    <MathGame
      style={gameStyle(student.gameStyle)}
      level={level}
      problems={makeGame(level)}
      backHref={`/student/${id}`}
      preview
    />
  );
}
