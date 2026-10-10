"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * The one sign-in a family shares - the child and the parent use the same
 * username and password.
 *
 * The password is shown once, in a block that copies as one message - the
 * tutor pastes it into WeChat rather than retyping a password on a phone.
 */
export function FamilyLogin({
  studentId,
  studentName,
  username,
}: {
  studentId: string;
  studentName: string;
  username?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [issued, setIssued] = useState<{ username: string; password: string } | null>(
    null,
  );
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function issue() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/students/${studentId}/logins`, { method: "POST" });
    setBusy(false);
    if (!res.ok) {
      setError("Could not create the sign-in.");
      return;
    }
    setIssued((await res.json()) as { username: string; password: string });
    setCopied(false);
    router.refresh();
  }

  async function remove() {
    setBusy(true);
    await fetch(`/api/students/${studentId}/logins`, { method: "DELETE" });
    setBusy(false);
    setIssued(null);
    router.refresh();
  }

  async function copy() {
    if (!issued) return;
    const text = [
      `${studentName}'s homework and your weekly notes:`,
      `${window.location.origin}/login`,
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
      <div>
        <h2 className="t-title">Family sign-in</h2>
        <p className="t-small t-muted mt-1">
          One sign-in for {studentName} and their parent. Inside there are two
          tabs: homework and goals for {studentName}, weekly notes for the parent.
        </p>
      </div>

      {issued && (
        <div className="card border-accent bg-accent-soft p-5">
          <dl className="t-body select-all">
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

      <div className="card space-y-4 p-4">
        <div className="flex items-center justify-between gap-3">
          <span className="t-small t-muted">Username</span>
          {username ? (
            <span className="font-mono text-[1.0625rem] font-semibold">{username}</span>
          ) : (
            <span className="t-small t-muted">No sign-in yet</span>
          )}
        </div>
        <div className={`grid gap-2 ${username ? "grid-cols-2" : ""}`}>
          <button onClick={() => void issue()} disabled={busy} className="btn btn-quiet">
            {busy ? "…" : username ? "Reset password" : "Create sign-in"}
          </button>
          {username && (
            <button onClick={() => void remove()} disabled={busy} className="btn btn-quiet">
              Remove
            </button>
          )}
        </div>
      </div>
      {error && <p className="note note-warn">{error}</p>}
    </section>
  );
}
