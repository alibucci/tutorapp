export const metadata = { title: "Tutor" };

/**
 * Students and parents.
 *
 * Comfortable density: a family reads one page, once, usually on a phone. No
 * navigation on purpose - a link grants one page and there is nowhere else to
 * go, so a nav bar would only offer dead ends.
 */
export default function GuestLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main
      data-density="comfortable"
      className="page page-narrow flex-1 py-10 sm:py-14"
    >
      {children}
    </main>
  );
}
