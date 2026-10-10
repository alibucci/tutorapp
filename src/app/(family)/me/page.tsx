import { notFound } from "next/navigation";
import { StudentHome } from "@/components/StudentHome";
import { requireFamily } from "@/lib/auth";
import { getStudent } from "@/lib/store";

export const dynamic = "force-dynamic";

export const metadata = { title: "What I'm working on" };

export default async function MyHome() {
  const session = await requireFamily();
  const student = await getStudent(session.id);
  if (!student) notFound();
  return (
    <StudentHome student={student} questHref={(id) => `/me/quest/${id}`} />
  );
}
