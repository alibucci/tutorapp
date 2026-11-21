import Link from "next/link";
import { notFound } from "next/navigation";
import { LibraryList, type LibraryRow } from "@/components/plans/LibraryList";
import { ChevronLeft } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { packFresh } from "@/lib/planShared";
import { planName } from "@/lib/plans";
import { listPlans } from "@/lib/store";
import { plansOpenTo } from "@/lib/tutorList";

export const dynamic = "force-dynamic";

/**
 * Every lesson this tutor has had written, to find and use again rather than
 * write again. Personal: nobody else's lessons are here, and nothing in a
 * lesson names a child.
 */
export default async function LibraryPage() {
  const session = await requireSession();
  if (!(await plansOpenTo(session.id))) notFound();
  const plans = await listPlans(session.id);
  const rows: LibraryRow[] = [];
  for (const plan of plans) {
    const name = await planName(plan);
    for (const card of plan.cards) {
      if (!card.materials?.slides.length) continue;
      rows.push({
        planId: plan.id,
        cardId: card.id,
        topic: card.topic,
        words: card.words,
        goal: card.goal,
        ages: card.audience?.ages ?? [],
        level: card.audience?.level,
        mark: card.mark,
        slides: card.materials.slides.length,
        from: name,
        fresh: packFresh(card),
        builtAt: card.materials.builtAt,
      });
    }
  }
  rows.sort((a, b) => b.builtAt.localeCompare(a.builtAt));
  const targets = await Promise.all(
    plans.filter((p) => !p.archivedAt).map(async (p) => ({ id: p.id, name: await planName(p) })),
  );

  return (
    <div className="stack-lg max-w-3xl">
      <header className="flex items-center gap-2 -ml-3">
        <Link href="/plans" aria-label="Back to plans" className="grid h-11 w-11 shrink-0 place-items-center rounded-[var(--radius)]">
          <ChevronLeft />
        </Link>
        <span>
          <h1 className="t-title">Library</h1>
          <p className="t-small t-muted">Every lesson you have had written. Use one again instead of starting over.</p>
        </span>
      </header>
      <LibraryList rows={rows} plans={targets} />
    </div>
  );
}
