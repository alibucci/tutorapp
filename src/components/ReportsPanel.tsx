"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ParentReport, ParentReportBody, Student } from "@/lib/types";

/**
 * The tutor gate. A draft is written by the model; nothing reaches a parent
 * until someone who was in the room has read it.
 */
export function ReportsPanel({
  student,
  reports,
}: {
  student: Student;
  reports: ParentReport[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function draft() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/students/${student.id}/reports`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (!res.ok) {
      const body = (await res.json()) as { error?: string };
      setError(body.error ?? "Could not draft the report.");
      setBusy(false);
      return;
    }
    router.refresh();
    setBusy(false);
  }

  return (
    <section className="space-y-4">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="t-subtitle">Weekly note to parent</h2>
        <button
          onClick={() => void draft()}
          disabled={busy}
          className="btn btn-quiet btn-sm"
        >
          {busy ? "Drafting..." : "Draft this week"}
        </button>
      </div>

      {error && <p className="note note-warn">{error}</p>}

      {reports.length === 0 ? (
        <p className="empty p-6 t-small t-muted">
          No notes yet. A draft is written from the week&rsquo;s lessons; you
          read and edit it before the parent sees anything.
        </p>
      ) : (
        <div className="space-y-4">
          {reports.map((report) => (
            <ReportCard key={report.id} report={report} />
          ))}
        </div>
      )}
    </section>
  );
}

function ReportCard({ report }: { report: ParentReport }) {
  const router = useRouter();
  const [body, setBody] = useState<ParentReportBody>(report.body);
  const [busy, setBusy] = useState(false);
  const approved = Boolean(report.approvedAt);

  async function save(approve: boolean) {
    setBusy(true);
    await fetch(`/api/reports/${report.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body, approved: approve }),
    });
    router.refresh();
    setBusy(false);
  }

  return (
    <div className="space-y-4 card p-5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="t-subtitle">
          {report.weekStart} &ndash; {report.weekEnd}
        </span>
        <span className="t-caption t-muted">
          {approved ? "visible to parent" : "draft - not sent"}
        </span>
      </div>

      <Field
        label="What moved this week"
        value={body.trajectory}
        rows={3}
        onChange={(trajectory) => setBody({ ...body, trajectory })}
      />
      <ListField
        label="Strengths"
        items={body.strengths}
        onChange={(strengths) => setBody({ ...body, strengths })}
      />
      <ListField
        label="Wins"
        items={body.wins}
        onChange={(wins) => setBody({ ...body, wins })}
      />
      <ListField
        label="Working on"
        items={body.working}
        onChange={(working) => setBody({ ...body, working })}
      />
      <ListField
        label="At home"
        items={body.atHome}
        onChange={(atHome) => setBody({ ...body, atHome })}
      />

      <div className="flex flex-wrap gap-2 border-t border-line pt-3">
        {!approved ? (
          <button
            onClick={() => void save(true)}
            disabled={busy}
            className="btn btn-primary"
          >
            {busy ? "Saving..." : "Approve and send"}
          </button>
        ) : (
          <button
            onClick={() => void save(false)}
            disabled={busy}
            className="btn btn-quiet"
          >
            Unpublish
          </button>
        )}
        <span className="self-center t-caption t-muted">
          {report.model}
          {report.editedByTutor && " · edited"}
        </span>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  rows,
  onChange,
}: {
  label: string;
  value: string;
  rows: number;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block t-eyebrow">
        {label}
      </span>
      <textarea
        value={value}
        rows={rows}
        onChange={(e) => onChange(e.target.value)}
        className="field"
      />
    </label>
  );
}

/** One line per item - simplest thing that lets a tutor cut a bad sentence. */
function ListField({
  label,
  items,
  onChange,
}: {
  label: string;
  items: string[];
  onChange: (v: string[]) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block t-eyebrow">
        {label}
      </span>
      <textarea
        value={items.join("\n")}
        rows={Math.max(2, items.length)}
        onChange={(e) =>
          onChange(e.target.value.split("\n").filter((l) => l.trim() !== ""))
        }
        className="field"
      />
      <span className="mt-1 block t-caption t-muted">One per line.</span>
    </label>
  );
}
