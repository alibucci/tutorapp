"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

/**
 * Extra homework in the tutor's own words. The games are built from the
 * request, then the tutor checks them and sends them as with any homework.
 */
export function ExtraHomework({
  studentId,
  studentName,
  christianity,
}: {
  studentId: string;
  studentName: string;
  /** Only where the module is on for this learner: the next story, or null at the end. */
  christianity?: { next: string | null; reference?: string; review?: string; approved: boolean };
}) {
  const router = useRouter();
  const [request, setRequest] = useState("");
  const [what, setWhat] = useState<"request" | "christianity">("request");
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

  async function makeStory() {
    setSeconds(0);
    setBusy(true);
    setError(null);
    const result = await api<{ id: string }>(
      `/api/students/${studentId}/christianity`,
      { method: "POST" },
      "Could not build it. Try again.",
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
      {christianity && (
        <div role="tablist" aria-label="Kind of homework" className="grid grid-cols-2 gap-2">
          {(
            [
              ["request", "Your request"],
              ["christianity", "Christianity"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={what === id}
              onClick={() => {
                setWhat(id);
                setError(null);
              }}
              disabled={busy}
              className={`btn btn-sm ${what === id ? "btn-soft" : "btn-ghost"}`}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {christianity && what === "christianity" ? (
        <div className="space-y-2">
          {christianity.next ? (
            <p className="t-small">
              Next story: <span className="font-semibold">{christianity.next}</span>
              {christianity.reference && <span className="t-muted"> · {christianity.reference}</span>}
              {christianity.review && (
                <span className="block t-muted">Starts with a short recap of &ldquo;{christianity.review}&rdquo;.</span>
              )}
            </p>
          ) : (
            <p className="note">That&rsquo;s all for now: {studentName} has had every story in the programme.</p>
          )}
          {christianity.next && !christianity.approved && (
            <p className="hint">This story&rsquo;s card is not approved yet: you can build and preview it, not send it.</p>
          )}
          {error && <p className="note note-warn">{error}</p>}
          <button
            onClick={() => void makeStory()}
            disabled={busy || !christianity.next}
            className="btn btn-primary btn-block"
          >
            {busy ? `Writing the story… ${seconds}s` : "Build"}
          </button>
          {busy && <p className="hint">Usually under a minute. The page opens when it is ready.</p>}
        </div>
      ) : (
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
      )}
    </section>
  );
}
