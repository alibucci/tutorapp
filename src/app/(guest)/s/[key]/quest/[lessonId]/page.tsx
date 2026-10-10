import { QuestPage } from "@/components/QuestPage";

export const dynamic = "force-dynamic";

export const metadata = { title: "Quest" };

export default async function LinkQuest({
  params,
}: {
  params: Promise<{ key: string; lessonId: string }>;
}) {
  const { key, lessonId } = await params;
  return <QuestPage lessonId={lessonId} linkKey={key} backHref={`/s/${key}`} />;
}
