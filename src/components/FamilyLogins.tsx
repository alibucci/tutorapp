"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Row = { who: "student" | "parent"; label: string; username?: string };

/**
 * Sign-ins for the child and the parent, made by the tutor.
 *
 * The password is shown once, in a block that copies as one message - the
 * tutor pastes it into WeChat rather than retyping a password on a phone.
 */
export function FamilyLogins({
  studentId,
  rows,
}: {
  studentId: string;
  rows: Row[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [issued, setIssued] = useState<
    { label: string; username: string; password: string } | null
  >(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function issue(row: Row) {
    setBusy(row.who);
    setError(null);
    const res = await fetch(`/api/students/${studentId}/logins`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ who: row.who }),
    });
    setBusy(null);
    if (!res.ok) {
      setError("Could not create the login.");
      return;
    }
    const body = (await res.json()) as { username: string; password: string };
    setIssued({ label: row.label, ...body });
    setCopied(false);
    router.refresh();
  }

  async function remove(row: Row) {
    setBusy(row.who);
    await fetch(`/api/students/${studentId}/logins?who=${row.who}`, {
      method: "DELETE",
    });
    setBusy(null);
    if (issued?.label === row.label) setIssued(null);
    router.refresh();
  }

  async function copy() {
    if (!issued) return;
    const text = [
      `Sign in at ${window.location.origin}/login`,
      `Username: ${issued.username}`,
      `Password: ${issued.password}`,
    ].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setError("Could not copy. Select the text and copy it by hand.");
    }
  }

  return (
    <section className="space-y-3">
      <h2 className="t-subtitle">Sign-ins</h2>

      {issued && (
        <div className="card border-accent bg-accent-soft p-5">
          <p className="t-small font-medium">{issued.label}</p>
          <dl className="mt-2 t-body select-all">
            <div>
              <dt className="inline t-muted">Username </dt>
              <dd className="inline font-mono">{issued.username}</dd>
            </div>
            <div>
              <dt className="inline t-muted">Password </dt>
              <dd className="inline font-mono">{issued.password}</dd>
            </div>
          </dl>
          <p className="hint">
            Shown once. Copy it and send it now - you can always reset it later.
          </p>
          <div className="mt-3 flex gap-2">
            <button onClick={() => void copy()} className="btn btn-primary btn-sm">
              {copied ? "Copied" : "Copy sign-in message"}
            </button>
            <button onClick={() => setIssued(null)} className="btn btn-quiet btn-sm">
              Done
            </button>
          </div>
        </div>
      )}

      <ul className="divide-y divide-line card">
        {rows.map((row) => (
          <li
            key={row.who}
            className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
          >
            <span className="min-w-0">
              <span className="block t-small">{row.label}</span>
              <span className="block t-caption t-muted">
                {row.username ? (
                  <>
                    Username <span className="font-mono">{row.username}</span>
                  </>
                ) : (
                  "No sign-in yet"
                )}
              </span>
            </span>
            <span className="flex shrink-0 gap-2">
              <button
                onClick={() => void issue(row)}
                disabled={busy !== null}
                className="btn btn-quiet btn-sm"
              >
                {busy === row.who
                  ? "…"
                  : row.username
                    ? "Reset password"
                    : "Create sign-in"}
              </button>
              {row.username && (
                <button
                  onClick={() => void remove(row)}
                  disabled={busy !== null}
                  className="btn btn-ghost btn-sm"
                >
                  Remove
                </button>
              )}
            </span>
          </li>
        ))}
      </ul>
      {error && <p className="note note-warn">{error}</p>}
    </section>
  );
}
