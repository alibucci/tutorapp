import { notFound } from "next/navigation";
import { ParentHome } from "@/components/ParentHome";
import { requireFamily } from "@/lib/auth";
import { getStudent } from "@/lib/store";

export const dynamic = "force-dynamic";

export const metadata = { title: "Weekly notes" };

export default async function FamilyHome() {
  const session = await requireFamily();
  const student = await getStudent(session.id);
  if (!student) notFound();
  return <ParentHome student={student} />;
}
