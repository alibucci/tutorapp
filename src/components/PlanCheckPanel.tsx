"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { PlanCheck } from "@/lib/types";

/**
 * What of the plan the lesson reached, and the one question it leaves: carry
 * the rest into the next planned lesson, or not.
 */
export function PlanCheckPanel({
  lessonId,
  check,
  planHref,
}: {
  lessonId: string;
  check?: PlanCheck;
  planHref: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  // Written in the background: look again until it is there.
  useEffect(() => {
    if (check) return;
    const t = window.setInterval(() => router.refresh(), 4000);
    return () => window.clearInterval(t);
  }, [check, router]);

  if (!check) {
    return <p className="note note-quiet">Checking the lesson against its plan…</p>;
  }
  const rest = [...check.missed, ...check.partial];

  async function answer(carry: boolean) {
    setBusy(true);
    const result = await api<{ to?: string }>(`/api/lessons/${lessonId}/plan`, { method: "POST", json: { carry } });
    setBusy(false);
    if (!result.ok) setNote(result.error);
    else if (carry) setNote(result.data.to ? `Added to "${result.data.to}".` : "There is no planned lesson to add it to.");
    router.refresh();
  }

  const list = (label: string, items: string[], tag: string) =>
    items.length > 0 && (
      <div>
        <span className={`tag ${tag}`}>{label}</span>
        <ul className="mt-1 list-disc pl-5 t-small">
          {items.map((i) => (
            <li key={i}>{i}</li>
          ))}
        </ul>
      </div>
    );

  return (
    <section className="card card-pad stack-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold">Against the plan</h2>
        <a href={planHref} className="t-small underline">Open the plan</a>
      </div>
      {list("Done", check.done, "tag-done")}
      {list("Partly", check.partial, "tag-info")}
      {list("Not reached", check.missed, "tag-warn")}
      {rest.length > 0 && !check.carried && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="t-small">Carry what was not done into the next lesson?</span>
          <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => void answer(true)}>
            Carry it over
          </button>
          <button className="btn btn-quiet btn-sm" disabled={busy} onClick={() => void answer(false)}>
            Leave it
          </button>
        </div>
      )}
      {check.carried && <p className="t-small t-muted">{check.carried === "yes" ? "Carried to the next lesson." : "Left as it is."}</p>}
      {note && <p className="t-small">{note}</p>}
    </section>
  );
}
