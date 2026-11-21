import Link from "next/link";
import { notFound } from "next/navigation";
import { NewPlanPicker } from "@/components/plans/NewPlanPicker";
import { ChevronRight } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { groupUsable } from "@/lib/groups";
import { planName, todayCard } from "@/lib/plans";
import { listGroups, listPlans, listStudents } from "@/lib/store";
import { plansOpenTo } from "@/lib/tutorList";

export const dynamic = "force-dynamic";

export default async function PlansPage() {
  const session = await requireSession();
  if (!(await plansOpenTo(session.id))) notFound();
  const [plans, students, groups] = await Promise.all([
    listPlans(session.id),
    listStudents(session.id),
    listGroups(session.id),
  ]);
  const live = await Promise.all(
    plans
      .filter((p) => !p.archivedAt)
      .map(async (p) => ({ plan: p, name: await planName(p), next: todayCard(p) })),
  );
  live.sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="stack-lg max-w-3xl">
      <header>
        <h1 className="t-display">Plans</h1>
        <p className="t-body t-muted mt-2">
          Lessons ready before you teach them: words, slides and notes, built for the child or the group.
        </p>
      </header>

      <NewPlanPicker
        students={students.filter((s) => !s.archivedAt).map((s) => ({ id: s.id, name: s.name }))}
        groups={groups.filter(groupUsable).map((g) => ({ id: g.id, name: g.name }))}
      />

      {live.length > 0 && (
        <section className="stack-sm">
          <h2 className="t-title">Your plans</h2>
          <ul className="card rows">
            {live.map(({ plan, name, next }) => (
              <li key={plan.id}>
                <Link href={`/plans/${plan.id}`} className="row row-link py-3">
                  <span className="min-w-0">
                    <span className="block font-semibold">{name}</span>
                    <span className="block t-small t-muted">
                      {plan.cards.length} {plan.cards.length === 1 ? "lesson" : "lessons"}
                      {next ? ` · next: ${next.topic || "untitled"}` : ""}
                    </span>
                  </span>
                  <ChevronRight />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="t-small t-muted">
        <Link href="/library" className="underline">Library</Link> - every lesson you have had written, to use again.{" "}
        <Link href="/groups" className="underline">Groups</Link> - a name and the children in it, picked in one tap.
      </p>
    </div>
  );
}
