"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useIssuePassword } from "@/components/IssuedPasswords";

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
  /** A reset or suspension that was refused: it has no form to show it in. */
  const [listError, setListError] = useState<string | null>(null);
  const issuePassword = useIssuePassword();

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/tutors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        email?: string;
        password?: string;
        error?: string;
      };
      if (!res.ok || !body.email || !body.password) {
        // No refresh here: if this browser has since signed in as someone
        // else, a refresh would leave the page and take the reason with it.
        setError(body.error ?? "Could not create the account.");
        return;
      }
      issuePassword({ email: body.email, password: body.password });
      setName("");
      setEmail("");
      router.refresh();
    } catch {
      setError("Could not reach the server. Check the connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function patch(id: string, payload: Record<string, unknown>) {
    setListError(null);
    try {
      const res = await fetch(`/api/tutors/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await res.json().catch(() => ({}))) as {
        password?: string;
        error?: string;
      };
      if (!res.ok) {
        setListError(body.error ?? "That did not work. Try again.");
        return;
      }
      if (body.password) {
        const row = tutors.find((t) => t.id === id);
        issuePassword({ email: row?.email ?? "", password: body.password });
      }
      router.refresh();
    } catch {
      setListError("Could not reach the server. Check the connection and try again.");
    }
  }

  return (
    <div className="stack-lg">
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

      {listError && <p className="note note-warn">{listError}</p>}

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
              <Link href={`/admin/tutors/${tutor.id}`} className="min-w-0 flex-1">
                <span className="block truncate t-small font-medium underline-offset-2 hover:underline">
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
              </Link>
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
