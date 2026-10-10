"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Child and parent share one sign-in; this is how each finds their page. */
export function FamilyTabs({ studentName }: { studentName: string }) {
  const path = usePathname();
  const tabs = [
    { href: "/me", label: studentName, on: path.startsWith("/me") },
    { href: "/family", label: "For parents", on: path.startsWith("/family") },
  ];
  return (
    <nav aria-label="Pages" className="flex gap-2">
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          aria-current={tab.on ? "page" : undefined}
          className={`pill ${tab.on ? "choice-on" : ""}`}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
