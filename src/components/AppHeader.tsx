import Link from "next/link";
import { SignOut } from "@/components/SignOut";

/** One header for both signed-in areas, so they cannot drift apart. */
export function AppHeader({
  name,
  context,
  action,
  accountHref,
}: {
  name: string;
  context?: string;
  action?: { href: string; label: string };
  accountHref?: string;
}) {
  return (
    <header className="border-b border-line bg-surface">
      <div className="page page-wide flex items-center justify-between gap-4 py-3">
        <Link href="/" className="flex min-w-0 items-center gap-2.5">
          <span
            aria-hidden
            className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-accent text-sm font-bold text-white"
          >
            T
          </span>
          <span className="min-w-0">
            <span className="block text-[1.0625rem] font-bold tracking-tight">
              Tutor Signal
            </span>
            {context && <span className="t-eyebrow block mt-0.5">{context}</span>}
          </span>
        </Link>
        <div className="flex shrink-0 items-center gap-2">
          {/* On a phone the home screen carries this as its big bottom button. */}
          {/* The wrapper does the hiding: .btn sets its own display, which
              would beat a `hidden` utility on the link itself. */}
          {action && (
            <span className="hidden sm:block">
              <Link href={action.href} className="btn btn-primary btn-sm">
                {action.label}
              </Link>
            </span>
          )}
          <SignOut name={name} accountHref={accountHref} />
        </div>
      </div>
    </header>
  );
}
