"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const res = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      const body = (await res.json()) as { error?: string };
      setError(body.error ?? "Could not sign in.");
      setBusy(false);
      return;
    }

    const { role } = (await res.json()) as { role: string };
    router.push(role === "admin" ? "/admin" : "/");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="stack">
      <div>
        <h1 className="t-display">Tutor Signal</h1>
        <p className="t-body t-muted mt-2">
          Accounts are created for you — there is no sign-up.
        </p>
      </div>

      <div className="field-group">
        <label className="block">
          <span className="label">Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            required
            className="field"
          />
        </label>

        <label className="block">
          <span className="label">Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
            className="field"
          />
        </label>
      </div>

      {error && (
        <p role="alert" className="note note-warn">
          {error}
        </p>
      )}

      <button type="submit" disabled={busy} className="btn btn-primary btn-lg w-full">
        {busy ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
