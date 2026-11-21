import Link from "next/link";
import { notFound } from "next/navigation";
import { PlanBoard } from "@/components/plans/PlanBoard";
import { ChevronLeft } from "@/components/ui";
import { isBuilding, isSuggesting, planFor, studentsOf } from "@/lib/plans";

export const dynamic = "force-dynamic";

export default async function PlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const found = await planFor(id);
  if (!found) notFound();
  const { plan } = found;
  const { students, group } = await studentsOf(plan);
  const name = group?.name ?? students[0]?.name ?? "Plan";

  return (
    <div className="stack-lg max-w-3xl">
      <header className="flex items-center gap-2 -ml-3">
        <Link href="/plans" aria-label="Back to plans" className="grid h-11 w-11 shrink-0 place-items-center rounded-[var(--radius)]">
          <ChevronLeft />
        </Link>
        <span className="min-w-0">
          <h1 className="t-title truncate">{name}</h1>
          <p className="t-small t-muted">
            {group ? students.map((s) => s.name).join(", ") : "One child"}
          </p>
        </span>
      </header>
      <PlanBoard
        plan={plan}
        building={plan.cards.filter(isBuilding).map((c) => c.id)}
        suggesting={isSuggesting(plan)}
      />
    </div>
  );
}
