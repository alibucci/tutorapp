"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Row = {
  id: string;
  email: string;
  name: string;
  active: boolean;
  mustChangePassword: boolean;
  students: number;
};

export function TutorAdmin({ tutors }: { tutors: Row[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Shown once and never again - the superadmin has to pass it on now. */
  const [issued, setIssued] = useState<{ email: string; password: string } | null>(
    null,
  );

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const res = await fetch("/api/tutors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email }),
    });

    if (!res.ok) {
      const body = (await res.json()) as { error?: string };
      setError(body.error ?? "Could not create the account.");
      setBusy(false);
      return;
    }

    const body = (await res.json()) as { email: string; password: string };
    setIssued(body);
    setName("");
    setEmail("");
    setBusy(false);
    router.refresh();
  }

  async function patch(id: string, payload: Record<string, unknown>) {
    const res = await fetch(`/api/tutors/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = (await res.json()) as { password?: string };
    if (body.password) {
      const row = tutors.find((t) => t.id === id);
      setIssued({ email: row?.email ?? "", password: body.password });
    }
    router.refresh();
  }

  return (
    <div className="stack-lg">
      {issued && (
        <div className="card border-accent bg-accent-soft p-5">
          <p className="t-subtitle">
            One-time password for {issued.email}
          </p>
          <p className="mt-2 font-mono t-title select-all">{issued.password}</p>
          <p className="hint">
            This is the only time it is shown. Send it to the tutor; they will be
            asked to change it.
          </p>
          <button
            onClick={() => setIssued(null)}
            className="btn btn-quiet mt-3"
          >
            I&rsquo;ve copied it
          </button>
        </div>
      )}

      <form onSubmit={create} className="card space-y-4 p-5">
        <p className="t-subtitle">Add a tutor</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="label">Name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="field"
            />
          </label>
          <label className="block">
            <span className="label">Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="field"
            />
          </label>
        </div>
        {error && <p className="note note-warn">{error}</p>}
        <button disabled={busy} className="btn btn-primary">
          {busy ? "Creating…" : "Create account"}
        </button>
      </form>

      {tutors.length === 0 ? (
        <p className="card border-dashed p-8 text-center t-small t-muted">
          No tutors yet.
        </p>
      ) : (
        <ul className="card divide-y divide-line">
          {tutors.map((tutor) => (
            <li
              key={tutor.id}
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5"
            >
              <span className="min-w-0">
                <span className="block truncate t-small font-medium">
                  {tutor.name}
                  {!tutor.active && (
                    <span className="ml-2 t-caption t-muted">
                      suspended
                    </span>
                  )}
                </span>
                <span className="block truncate t-caption t-muted">
                  {tutor.email} &middot; {tutor.students}{" "}
                  {tutor.students === 1 ? "student" : "students"}
                  {tutor.mustChangePassword && " · password not changed yet"}
                </span>
              </span>
              <span className="flex shrink-0 gap-2">
                <button
                  onClick={() => void patch(tutor.id, { resetPassword: true })}
                  className="btn btn-quiet t-caption"
                >
                  Reset password
                </button>
                <button
                  onClick={() => void patch(tutor.id, { active: !tutor.active })}
                  className="btn btn-quiet t-caption"
                >
                  {tutor.active ? "Suspend" : "Restore"}
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
