import { QuestPage } from "@/components/QuestPage";
import { requireFamily } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const metadata = { title: "Quest" };

export default async function MyQuest({
  params,
}: {
  params: Promise<{ lessonId: string }>;
}) {
  await requireFamily("student");
  const { lessonId } = await params;
  return <QuestPage lessonId={lessonId} backHref="/me" />;
}
