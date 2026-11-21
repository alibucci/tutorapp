import Link from "next/link";
import { notFound } from "next/navigation";
import { CardEditor } from "@/components/plans/CardEditor";
import { ChevronLeft } from "@/components/ui";
import { picturesOn } from "@/lib/planImages";
import { isBuilding, planFor, studentsOf } from "@/lib/plans";

export const dynamic = "force-dynamic";

export default async function PlanCardPage({ params }: { params: Promise<{ id: string; cardId: string }> }) {
  const { id, cardId } = await params;
  const found = await planFor(id);
  const card = found?.plan.cards.find((c) => c.id === cardId);
  if (!found || !card) notFound();
  const { students, group } = await studentsOf(found.plan);
  const index = found.plan.cards.findIndex((c) => c.id === cardId);

  return (
    <div className="stack-lg max-w-3xl">
      <header className="flex items-center gap-2 -ml-3">
        <Link href={`/plans/${id}`} aria-label="Back to the plan" className="grid h-11 w-11 shrink-0 place-items-center rounded-[var(--radius)]">
          <ChevronLeft />
        </Link>
        <span className="min-w-0">
          <p className="t-small t-muted">
            {group?.name ?? students[0]?.name} · lesson {index + 1} · {found.plan.durationMinutes} min
          </p>
          <h1 className="t-title truncate">{card.topic || "Untitled lesson"}</h1>
        </span>
      </header>
      <CardEditor planId={id} card={card} building={isBuilding(card)} canDraw={picturesOn()} group={Boolean(group)} />
    </div>
  );
}
