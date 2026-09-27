"use client";

import { useState } from "react";
import type { Student } from "@/lib/types";

/**
 * A link is the credential for now - no accounts. Good enough to validate
 * whether these views are wanted at all; real auth comes after that.
 */
export function ShareLinks({ student }: { student: Student }) {
  const [copied, setCopied] = useState<string | null>(null);

  const links = [
    {
      label: "Student link",
      hint: "What they are working on. Updates after each lesson you review.",
      path: `/s/${student.studentKey}`,
    },
    {
      label: "Parent link",
      hint: "Weekly notes you have approved. Nothing else is visible.",
      path: `/p/${student.parentKey}`,
    },
  ];

  async function copy(path: string) {
    const url = `${window.location.origin}${path}`;
    await navigator.clipboard.writeText(url);
    setCopied(path);
    window.setTimeout(() => setCopied(null), 2000);
  }

  return (
    <section className="space-y-3">
      <h2 className="t-subtitle">Links</h2>
      <ul className="divide-y divide-line card">
        {links.map((link) => (
          <li
            key={link.path}
            className="flex items-center justify-between gap-4 px-4 py-3"
          >
            <span className="min-w-0">
              <span className="block t-small">{link.label}</span>
              <span className="block t-caption t-muted">{link.hint}</span>
            </span>
            <button
              onClick={() => void copy(link.path)}
              className="shrink-0 btn btn-quiet btn-sm"
            >
              {copied === link.path ? "Copied" : "Copy"}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
