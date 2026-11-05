import { AppHeader } from "@/components/AppHeader";
import { IssuedPasswords } from "@/components/IssuedPasswords";
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
      {/* Straight to the admin home: going by "/" passes through the tutor layout,
          and leaving this layout would lose a password still on screen. */}
      <AppHeader name={session.name} context="Administration" homeHref="/admin" />
      <div className="page page-wide flex-1 py-8">
        <IssuedPasswords>{children}</IssuedPasswords>
      </div>
    </>
  );
}
