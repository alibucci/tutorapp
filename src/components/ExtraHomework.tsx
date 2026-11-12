"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

/**
 * Extra homework in the tutor's own words. The games are built from the
 * request, then the tutor checks them and sends them as with any homework.
 */
export function ExtraHomework({ studentId, studentName }: { studentId: string; studentName: string }) {
  const router = useRouter();
  const [request, setRequest] = useState("");
  const [busy, setBusy] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Building takes half a minute; count it so it reads as progress.
  useEffect(() => {
    if (!busy) return;
    const timer = window.setInterval(() => setSeconds((n) => n + 1), 1000);
    return () => window.clearInterval(timer);
  }, [busy]);

  async function make() {
    setSeconds(0);
    setBusy(true);
    setError(null);
    const result = await api<{ id: string; built: boolean }>(
      `/api/students/${studentId}/practice`,
      { method: "POST", json: { request } },
      "Could not make the homework. Try again.",
    );
    if (!result.ok) {
      setBusy(false);
      setError(result.error);
      return;
    }
    router.push(`/lesson/${result.data.id}/review#homework`);
  }

  return (
    <section className="card card-pad space-y-3">
      <div>
        <p className="font-semibold">Extra homework</p>
        <p className="t-small t-muted mt-1">
          Say what {studentName} should practise, and the games are made from
          that - in {studentName}&rsquo;s look. You check them before sending.
        </p>
      </div>
      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          void make();
        }}
      >
        <textarea
          value={request}
          onChange={(e) => setRequest(e.target.value)}
          placeholder="e.g. Animals and what they eat, for Friday's zoo trip"
          rows={3}
          maxLength={300}
          required
          disabled={busy}
          className="field"
        />
        {error && <p className="note note-warn">{error}</p>}
        <button disabled={busy || request.trim().length < 4} className="btn btn-primary btn-block">
          {busy ? `Making the games… ${seconds}s` : "Make homework"}
        </button>
        {busy && (
          <p className="hint">Usually under a minute. The page opens when they are ready.</p>
        )}
      </form>
    </section>
  );
}
