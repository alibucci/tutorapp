"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth-constants";

export function PasswordForm({ first }: { first: boolean }) {
  const router = useRouter();
  const [currentPassword, setCurrent] = useState("");
  const [newPassword, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const res = await fetch("/api/account", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword }),
    });

    if (!res.ok) {
      const body = (await res.json()) as { error?: string };
      setError(body.error ?? "Could not change the password.");
      setBusy(false);
      return;
    }

    setCurrent("");
    setNext("");
    setDone(true);
    setBusy(false);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="card card-pad stack-sm">
      <h2 className="t-title">Change your password</h2>

      {first && (
        <p className="note note-warn">
          You are still on the one-time password you were given. Whoever set up
          your account knows it, so change it now.
        </p>
      )}

      <div className="field-group">
        <label className="block">
          <span className="label">Current password</span>
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrent(e.target.value)}
            autoComplete="current-password"
            required
            className="field"
          />
        </label>

        <label className="block">
          <span className="label">New password</span>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNext(e.target.value)}
            autoComplete="new-password"
            minLength={MIN_PASSWORD_LENGTH}
            required
            className="field"
          />
          <span className="hint">
            At least {MIN_PASSWORD_LENGTH} characters. Changing it signs you out
            everywhere else.
          </span>
        </label>
      </div>

      {error && (
        <p role="alert" className="note note-warn">
          {error}
        </p>
      )}
      {done && <p className="note note-accent">Password changed.</p>}

      <button disabled={busy} className="btn btn-primary">
        {busy ? "Saving…" : "Change password"}
      </button>
    </form>
  );
}
