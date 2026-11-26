"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api";
import type { SmartReview } from "@/lib/types";

/**
 * Skip a Smart Review, archive it (a new lesson made it stale), or bring it
 * back. Set aside, it stops holding the schedule's next one back.
 */
export function ReviewActions({ lessonId, state }: { lessonId: string; state?: SmartReview["state"] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function set(next: "skipped" | "archived" | null) {
    setBusy(true);
    setError(null);
    const r = await api(`/api/lessons/${lessonId}/review`, { method: "PATCH", json: { state: next } });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    router.refresh();
  }
  const aside = state === "skipped" || state === "archived";
  return (
    <div className="flex flex-wrap items-center gap-2">
      {aside ? (
        <>
          <span className="t-small t-muted">{state === "skipped" ? "Skipped." : "Archived."}</span>
          <button className="btn btn-quiet btn-sm" disabled={busy} onClick={() => void set(null)}>
            Bring it back
          </button>
        </>
      ) : (
        <>
          <button className="btn btn-quiet btn-sm" disabled={busy} onClick={() => void set("skipped")}>
            Skip this one
          </button>
          <button className="btn btn-quiet btn-sm" disabled={busy} onClick={() => void set("archived")}>
            Archive
          </button>
        </>
      )}
      {error && <span className="t-small text-warn">{error}</span>}
    </div>
  );
}
