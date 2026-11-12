import { notFound } from "next/navigation";
import { StudentHome } from "@/components/StudentHome";
import { getStudentByKey } from "@/lib/store";

export const dynamic = "force-dynamic";

export const metadata = { title: "What I'm working on" };

/** The child's screen, reached by private link. */
export default async function StudentView({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { key } = await params;
  const student = await getStudentByKey("studentKey", key);
  if (!student) notFound();
  return (
    <StudentHome
      student={student}
      questHref={(lessonId) => `/s/${key}/quest/${lessonId}`}
      linkKey={key}
    />
  );
}
