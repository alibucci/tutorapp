import Link from "next/link";
import { notFound } from "next/navigation";
import { GroupsManager } from "@/components/GroupsManager";
import { ChevronLeft } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { listGroups, listStudents } from "@/lib/store";
import { plansOpenTo } from "@/lib/tutorList";

export const dynamic = "force-dynamic";

export default async function GroupsPage() {
  const session = await requireSession();
  if (!(await plansOpenTo(session.id))) notFound();
  const [groups, students] = await Promise.all([listGroups(session.id), listStudents(session.id)]);
  return (
    <div className="stack-lg max-w-2xl">
      <header className="flex items-center gap-2 -ml-3">
        <Link href="/plans" aria-label="Back to plans" className="grid h-11 w-11 shrink-0 place-items-center rounded-[var(--radius)]">
          <ChevronLeft />
        </Link>
        <span>
          <h1 className="t-title">Groups</h1>
          <p className="t-small t-muted">
            A name and the children in it. Pick it in one tap for a lesson or a plan.
          </p>
        </span>
      </header>
      <GroupsManager
        groups={groups}
        students={students.filter((s) => !s.archivedAt).map((s) => ({ id: s.id, name: s.name }))}
      />
    </div>
  );
}
