import { notFound } from "next/navigation";
import { MathGame } from "@/components/MathGame";
import { requireFamily } from "@/lib/auth";
import { styleFor } from "@/lib/gameStyles";
import { makeGame } from "@/lib/math";
import { getStudent } from "@/lib/store";

export const dynamic = "force-dynamic";

export const metadata = { title: "Math practice" };

export default async function MyMath() {
  const session = await requireFamily();
  const student = await getStudent(session.id);
  if (!student?.math?.on) notFound();
  return (
    <MathGame
      style={styleFor(student)}
      level={student.math.level}
      problems={makeGame(student.math.level)}
      backHref="/me"
    />
  );
}
