"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api";

type Saved = { address: string; confirmed: boolean } | null;

/**
 * Homework notices by email. The tutor gives an address - not necessarily
 * their login, which is often not a real mailbox - and confirms it from the
 * link we send. Only then does anything else go to it.
 */
export function EmailNotices({ saved, just }: { saved: Saved; just?: "confirmed" | "expired" }) {
  const router = useRouter();
  const [editing, setEditing] = useState(!saved);
  const [address, setAddress] = useState(saved?.address ?? "");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(
    just === "confirmed"
      ? { ok: true, text: "Address confirmed. You will get an email when a student finishes their homework." }
      : just === "expired"
        ? { ok: false, text: "That link has expired or was replaced. Send a new one." }
        : null,
  );

  async function sendLink(to: string) {
    setBusy(true);
    setNote(null);
    const result = await api<{ address: string }>(
      "/api/account/email",
      { method: "PUT", json: { address: to } },
      "Could not send the link. Try again.",
    );
    setBusy(false);
    if (!result.ok) {
      setNote({ ok: false, text: result.error });
      return;
    }
    setEditing(false);
    setNote({ ok: true, text: `Link sent to ${result.data.address}. Open it to switch notices on - look in spam if it is not there.` });
    router.refresh();
  }

  async function switchOff() {
    setBusy(true);
    setNote(null);
    const result = await api("/api/account/email", { method: "DELETE" });
    setBusy(false);
    if (!result.ok) {
      setNote({ ok: false, text: result.error });
      return;
    }
    setAddress("");
    setEditing(true);
    router.refresh();
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

  const status = saved?.confirmed ? "On" : saved ? "Waiting" : "Off";

  return (
    <section className="card card-pad space-y-3">
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0">
          <span className="block font-semibold">Email</span>
          {saved && !editing && (
            <span className="block t-small t-muted truncate">
              {saved.confirmed ? `Sending to ${saved.address}` : `Waiting for you to confirm ${saved.address}`}
            </span>
          )}
        </span>
        <span className={`tag ${status === "On" ? "tag-done" : "tag-quiet"}`}>{status}</span>
      </div>
      <p className="t-small t-muted">
        An email when a child finishes their homework, and when one struggles
        badly enough to be worth a second look.
      </p>

      {editing ? (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            void sendLink(address);
          }}
        >
          <label className="block">
            <span className="label">Send notices to</span>
            <input
              type="email"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              required
              className="field"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button disabled={busy} className="btn btn-primary btn-sm">
              {busy ? "Sending…" : "Send a confirmation link"}
            </button>
            {saved && (
              <button type="button" onClick={() => setEditing(false)} className="btn btn-quiet btn-sm">
                Cancel
              </button>
            )}
          </div>
        </form>
      ) : null}

      {note && <p className={`note ${note.ok ? "note-accent" : "note-warn"}`}>{note.text}</p>}

      {saved && !editing && (
        <div className="flex flex-wrap gap-2">
          {saved.confirmed ? (
            <button onClick={() => void test()} disabled={busy} className="btn btn-quiet btn-sm">
              Send a test email
            </button>
          ) : (
            <button onClick={() => void sendLink(saved.address)} disabled={busy} className="btn btn-quiet btn-sm">
              Send the link again
            </button>
          )}
          <button onClick={() => setEditing(true)} disabled={busy} className="btn btn-quiet btn-sm">
            Change address
          </button>
          <button onClick={() => void switchOff()} disabled={busy} className="btn btn-quiet btn-sm">
            Switch off
          </button>
        </div>
      )}
    </section>
  );
}
