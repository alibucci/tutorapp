"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { suggestUsername } from "@/lib/usernames";

type Confirm = "reset" | "remove" | null;

/**
 * The one sign-in a family shares - the child and the parent use the same
 * username and password.
 *
 * The password is shown once, in a block that copies as one message - the
 * tutor pastes it into WeChat rather than retyping a password on a phone. The
 * message is in Chinese and English, because that is who reads it.
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
  const [chosen, setChosen] = useState(() => suggestUsername(studentName));
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [issued, setIssued] = useState<{ username: string; password: string } | null>(
    null,
  );
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function issue() {
    setConfirm(null);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/students/${studentId}/logins`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(username ? {} : { username: chosen }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        username?: string;
        password?: string;
        error?: string;
      };
      if (!res.ok || !body.username || !body.password) {
        setError(body.error ?? "Could not create the sign-in. Try again.");
        return;
      }
      setIssued({ username: body.username, password: body.password });
      setCopied(false);
      router.refresh();
    } catch {
      setError("Could not reach the server. Check the connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setConfirm(null);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/students/${studentId}/logins`, { method: "DELETE" });
      if (!res.ok) {
        setError("Could not remove the sign-in. Try again.");
        return;
      }
      setIssued(null);
      router.refresh();
    } catch {
      setError("Could not reach the server. Check the connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!issued) return;
    const url = `${window.location.origin}/login`;
    const text = [
      `${studentName} 的作业和每周学习报告：`,
      url,
      `用户名：${issued.username}`,
      `密码：${issued.password}`,
      "",
      `${studentName}'s homework and your weekly notes:`,
      url,
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
            The message is in Chinese and English.
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
        {username ? (
          <>
            <div className="flex items-center justify-between gap-3">
              <span className="t-small t-muted">Username</span>
              <span className="font-mono text-[1.0625rem] font-semibold">{username}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setConfirm("reset")}
                disabled={busy}
                className="btn btn-quiet"
              >
                Reset password
              </button>
              <button
                onClick={() => setConfirm("remove")}
                disabled={busy}
                className="btn btn-quiet"
              >
                Remove
              </button>
            </div>
          </>
        ) : (
          <>
            <label className="block">
              <span className="label">Username</span>
              <input
                value={chosen}
                onChange={(e) => setChosen(e.target.value.toLowerCase())}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                placeholder="e.g. xiaoming"
                className="field font-mono"
              />
              <span className="hint">
                Lowercase letters and numbers. For a Chinese name, the pinyin
                works well.
              </span>
            </label>
            <button
              onClick={() => void issue()}
              disabled={busy || chosen.trim().length < 3}
              className="btn btn-primary btn-block"
            >
              {busy ? "Creating…" : "Create sign-in"}
            </button>
          </>
        )}
      </div>
      {error && <p className="note note-warn">{error}</p>}

      <ConfirmDialog
        open={confirm === "reset"}
        title="Reset the family's password?"
        body={`${studentName} and their parent are signed out on every phone straight away. You get a new password to send them.`}
        confirmLabel="Reset password"
        cancelLabel="Keep the old one"
        onConfirm={() => void issue()}
        onCancel={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={confirm === "remove"}
        title="Remove the family's sign-in?"
        body={`${studentName} and their parent are signed out on every phone and cannot sign in again until you make a new one.`}
        confirmLabel="Remove"
        cancelLabel="Keep it"
        onConfirm={() => void remove()}
        onCancel={() => setConfirm(null)}
      />
    </section>
  );
}
