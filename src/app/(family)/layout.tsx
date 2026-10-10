import { SignOut } from "@/components/SignOut";

export const metadata = { title: "Tutor Signal" };

/**
 * Children and parents who signed in. Same comfortable reading density as the
 * private links, plus the one thing a login needs: a way out.
 */
export default function FamilyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <header className="page page-narrow flex justify-end pt-4">
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
