import { FamilyTabs } from "@/components/FamilyTabs";
import { SignOut } from "@/components/SignOut";
import { requireFamily } from "@/lib/auth";
import { getStudent } from "@/lib/store";

export const metadata = { title: "aloudli" };

/**
 * A family signed in: the child and the parent share the sign-in, so the top
 * of every page offers both of their pages, plus a way out. Same comfortable
 * reading density as the private links.
 */
export default async function FamilyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireFamily();
  const student = await getStudent(session.id);

  return (
    <>
      <header className="page page-narrow flex items-center justify-between gap-3 pt-4">
        <FamilyTabs studentName={student?.name ?? "Student"} />
        <SignOut name="" />
      </header>
      <main
        data-density="comfortable"
        className="page page-narrow flex-1 py-8 sm:py-12"
      >
        {children}
      </main>
    </>
  );
}
