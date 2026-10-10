"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import type { Student } from "@/lib/types";

/**
 * The other way in: a private link, no password. Handy for a parent who will
 * never keep a password; sign-ins above are for everyone else.
 */
export function ShareLinks({ student }: { student: Student }) {
  const router = useRouter();
  const [copied, setCopied] = useState<string | null>(null);
  const [rotating, setRotating] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const links = [
    {
      label: "Student link",
      hint: "Their homework and what they are working on.",
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

  async function rotate() {
    setConfirming(false);
    setRotating(true);
    try {
      await fetch(`/api/students/${student.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rotateLinks: true }),
      });
      router.refresh();
    } finally {
      setRotating(false);
    }
  }

  return (
    <section className="space-y-3">
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
      <button
        onClick={() => setConfirming(true)}
        disabled={rotating}
        className="btn btn-quiet btn-sm"
      >
        {rotating ? "Replacing…" : "Replace both links"}
      </button>
      <ConfirmDialog
        open={confirming}
        title="Replace both links?"
        body="The links you have already sent stop working straight away. You will need to send the new ones."
        confirmLabel="Replace links"
        cancelLabel="Keep them"
        onConfirm={() => void rotate()}
        onCancel={() => setConfirming(false)}
      />
      <p className="hint">
        A link that has been shared cannot be taken back. Replacing them breaks
        the old ones immediately — use this if one goes somewhere it should not.
      </p>
    </section>
  );
}
