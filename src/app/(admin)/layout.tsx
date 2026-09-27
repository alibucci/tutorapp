import { AppHeader } from "@/components/AppHeader";
import { requireAdmin } from "@/lib/auth";

/** Superadmin only. Nobody signs themselves up anywhere in this app. */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireAdmin();
  return (
    <>
      <AppHeader name={session.name} context="Administration" />
      <div className="page page-wide flex-1 py-8">{children}</div>
    </>
  );
}
