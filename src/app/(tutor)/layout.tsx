import { redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { requireSession } from "@/lib/auth";

/**
 * The tutor's workspace. Default (compact) density: this is a tool someone is
 * in all day, and seeing more at once beats generous spacing.
 */
export default async function TutorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireSession();
  if (session.role === "admin") redirect("/admin");

  return (
    <>
      <AppHeader
        name={session.name}
        action={{ href: "/lesson/new", label: "New lesson" }}
      />
      <div className="page page-wide flex-1 py-8">{children}</div>
    </>
  );
}
