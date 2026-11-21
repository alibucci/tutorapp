import { NewLessonForm } from "@/components/NewLessonForm";
import { requireSession } from "@/lib/auth";
import { groupUsable } from "@/lib/groups";
import { planFor, studentsOf } from "@/lib/plans";
import { listGroups, listStudents } from "@/lib/store";
import { plansOpenTo } from "@/lib/tutorList";

export const dynamic = "force-dynamic";

export default async function NewLessonPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string; card?: string }>;
}) {
  const session = await requireSession();
  const students = await listStudents(session.id);
  const open = await plansOpenTo(session.id);
  // Saved groups, for the tutors who have them: one tap fills in the children.
  const groups = open
    ? (await listGroups(session.id)).filter(groupUsable).map((g) => ({
        id: g.id,
        name: g.name,
        studentIds: g.studentIds.filter((id) => students.some((s) => s.id === id && !s.archivedAt)),
      }))
    : undefined;

  // Started from a plan card: the children and the title come from the plan.
  const { plan: planId, card: cardId } = await searchParams;
  let fromPlan: { planId: string; cardId: string; title: string; studentIds: string[] } | undefined;
  if (open && planId && cardId) {
    const found = await planFor(planId);
    const card = found?.plan.cards.find((c) => c.id === cardId);
    if (found && card) {
      const { students: kids } = await studentsOf(found.plan);
      fromPlan = { planId, cardId, title: card.topic, studentIds: kids.map((k) => k.id) };
    }
  }
  return <NewLessonForm students={students} groups={groups} fromPlan={fromPlan} />;
}
