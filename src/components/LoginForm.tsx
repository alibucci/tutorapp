"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const res = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim(), password }),
    });

    if (!res.ok) {
      const body = (await res.json()) as { error?: string };
      setError(body.error ?? "Could not sign in.");
      setBusy(false);
      return;
    }

    const { next } = (await res.json()) as { next: string };
    router.push(next);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="stack">
      <div>
        <span
          aria-hidden
          className="grid h-12 w-12 place-items-center rounded-[var(--radius-lg)] bg-accent text-2xl font-bold text-white"
        >
          T
        </span>
        <h1 className="t-display mt-4">Tutor Signal</h1>
        <p className="t-body t-muted mt-2">
          Use the sign-in your tutor or school sent you.
        </p>
      </div>

      <div className="field-group">
        <label className="block">
          <span className="label">Email or username</span>
          {/* Plain text, not type=email: children and parents sign in with a
              username. Phones must not capitalise or "correct" it. */}
          <input
            type="text"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            required
            className="field"
          />
        </label>

        <label className="block">
          <span className="label">Password</span>
          <span className="relative block">
            <input
              type={show ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              required
              className="field pr-16"
            />
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              className="absolute inset-y-0 right-0 px-4 t-small font-semibold text-accent"
            >
              {show ? "Hide" : "Show"}
            </button>
          </span>
        </label>
      </div>

      {error && (
        <p role="alert" className="note note-warn">
          {error} If your phone filled the password in for you, check it is the
          right one - tap Show.
        </p>
      )}

      <button type="submit" disabled={busy} className="btn btn-primary btn-lg btn-block">
        {busy ? "Signing in…" : "Sign in"}
      </button>

      <p className="t-small t-muted text-center">
        Forgot it? Families: ask your tutor. Tutors: ask your administrator.
        Either can reset it in one tap.
      </p>
    </form>
  );
}
