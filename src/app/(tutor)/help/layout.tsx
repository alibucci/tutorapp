import { HelpNav } from "@/components/HelpNav";

/** Topics on the left, one film at a time on the right. */
export default function HelpLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid gap-6 md:grid-cols-[16rem_minmax(0,1fr)] md:gap-10">
      <aside className="md:sticky md:top-6 md:self-start md:max-h-[calc(100vh-3rem)] md:overflow-y-auto">
        <HelpNav />
      </aside>
      <main className="min-w-0">{children}</main>
    </div>
  );
}
