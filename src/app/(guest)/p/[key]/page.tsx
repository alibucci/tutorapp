import { notFound } from "next/navigation";
import { ParentHome } from "@/components/ParentHome";
import { getStudentByKey } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ key: string }> }) {
  // Added to a home screen from here, the icon opens this link.
  const { key } = await params;
  return { title: "Weekly notes", manifest: `/p/${encodeURIComponent(key)}/app.webmanifest` };
}

/** The parent's screen, reached by private link. */
export default async function ParentView({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { key } = await params;
  const student = await getStudentByKey("parentKey", key);
  if (!student) notFound();
  return <ParentHome student={student} linkKey={key} />;
}
