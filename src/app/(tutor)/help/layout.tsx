import { HelpNav } from "@/components/HelpNav";
import { requireSession } from "@/lib/auth";
import { helpFor } from "@/lib/help";
import { helpAccess } from "@/lib/helpAccess";

/** Topics on the left, one film (or page of steps) at a time on the right. */
export default async function HelpLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const topics = helpFor(await helpAccess(session)).map((f) => ({
    id: f.id,
    title: f.title,
    film: Boolean(f.file),
  }));
  return (
    <div className="grid gap-6 md:grid-cols-[16rem_minmax(0,1fr)] md:gap-10">
      <aside className="md:sticky md:top-6 md:self-start md:max-h-[calc(100vh-3rem)] md:overflow-y-auto">
        <HelpNav topics={topics} />
      </aside>
      <main className="min-w-0">{children}</main>
    </div>
  );
}
