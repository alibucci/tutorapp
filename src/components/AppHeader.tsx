import Link from "next/link";
import { SignOut } from "@/components/SignOut";

/** One header for both signed-in areas, so they cannot drift apart. */
export function AppHeader({
  name,
  context,
  action,
}: {
  name: string;
  context?: string;
  action?: { href: string; label: string };
}) {
  return (
    <header className="border-b border-line bg-surface">
      <div className="page page-wide flex items-center justify-between gap-4 py-3.5">
        <Link href="/" className="min-w-0">
          <span className="t-subtitle block">Tutor Signal</span>
          {context && <span className="t-eyebrow block">{context}</span>}
        </Link>
        <div className="flex shrink-0 items-center gap-2">
          {action && (
            <Link href={action.href} className="btn btn-primary">
              {action.label}
            </Link>
          )}
          <SignOut name={name} />
        </div>
      </div>
    </header>
  );
}
