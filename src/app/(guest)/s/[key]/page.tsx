import { notFound } from "next/navigation";
import { StudentHome } from "@/components/StudentHome";
import { getStudentByKey } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ key: string }> }) {
  // Added to a home screen from here, the icon opens this link.
  const { key } = await params;
  return { title: "What I'm working on", manifest: `/s/${encodeURIComponent(key)}/app.webmanifest` };
}

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
