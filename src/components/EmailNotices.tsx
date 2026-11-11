"use client";

import { useState } from "react";
import { api } from "@/lib/api";

/** Homework notices by email, to the address the tutor signs in with. */
export function EmailNotices({ email, on: savedOn }: { email: string; on: boolean }) {
  const [on, setOn] = useState(savedOn);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  async function toggle() {
    setBusy(true);
    setNote(null);
    const result = await api<{ on: boolean }>(
      "/api/account/email",
      { method: "PATCH", json: { on: !on } },
      "Could not save that. Try again.",
    );
    setBusy(false);
    if (result.ok) setOn(result.data.on);
    else setNote({ ok: false, text: result.error });
  }

  async function test() {
    setBusy(true);
    setNote(null);
    const result = await api<{ sentTo: string }>("/api/account/email", { method: "POST" });
    setBusy(false);
    setNote(
      result.ok
        ? { ok: true, text: `Sent to ${result.data.sentTo}. Not there in a minute? Look in spam.` }
        : { ok: false, text: result.error },
    );
  }

  return (
    <section className="card card-pad space-y-3">
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0">
          <span className="block font-semibold">Email</span>
          <span className="block t-small t-muted truncate">{email}</span>
        </span>
        <span className={`tag ${on ? "tag-done" : "tag-quiet"}`}>{on ? "On" : "Off"}</span>
      </div>
      <p className="t-small t-muted">
        An email when a child finishes their homework, and when one struggles
        badly enough to be worth a second look.
      </p>
      {note && <p className={`note ${note.ok ? "note-accent" : "note-warn"}`}>{note.text}</p>}
      <div className="flex flex-wrap gap-2">
        <button onClick={() => void toggle()} disabled={busy} className="btn btn-quiet btn-sm">
          {on ? "Switch off" : "Switch on"}
        </button>
        {on && (
          <button onClick={() => void test()} disabled={busy} className="btn btn-quiet btn-sm">
            Send a test email
          </button>
        )}
      </div>
    </section>
  );
}
