import { NewLessonForm } from "@/components/NewLessonForm";
import { requireSession } from "@/lib/auth";
import { listStudents } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function NewLessonPage() {
  const session = await requireSession();
  return <NewLessonForm students={await listStudents(session.id)} />;
}
