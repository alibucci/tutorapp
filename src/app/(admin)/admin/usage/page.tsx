import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { getStudent, listTutors } from "@/lib/store";
import {
  PURPOSE_LABELS,
  monthOf,
  readUsage,
  smartReviewCost,
  summariseUsage,
  type UsagePurpose,
  type UsageRow,
} from "@/lib/usage";

export const dynamic = "force-dynamic";

export const metadata = { title: "Usage" };

/** How many children to show by cost: enough to see who is dear, not a ledger. */
const TOP_STUDENTS = 10;

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

/** "2026-11" moved by whole months. */
function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split("-").map(Number);
  return monthOf(new Date(Date.UTC(y, m - 1 + by, 1)));
}

/** Most calls cost a fraction of a cent: show enough of it to compare. */
function usd(n: number): string {
  return `$${n >= 1 ? n.toFixed(2) : n.toFixed(4)}`;
}

const count = (n: number) => Math.round(n).toLocaleString("en-GB");

/**
 * What AI generation cost in a month: by purpose, by child, by model. Read
 * from the usage log (lib/usage.ts); every figure is an estimate from the
 * price table, which is only as right as its prices.
 */
export default async function UsagePage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string | string[] }>;
}) {
  // The layout checks too, but a layout is not re-run on every navigation,
  // and this page names children and what they cost.
  await requireAdmin();
  const asked = (await searchParams).month;
  const month = typeof asked === "string" && MONTH.test(asked) ? asked : monthOf();

  const entries = await readUsage(month);
  const summary = summariseUsage(entries);
  const review = smartReviewCost(entries);

  const tutors = new Map((await listTutors()).map((t) => [t.id, t.name]));
  const top = await Promise.all(
    summary.byStudent.slice(0, TOP_STUDENTS).map(async (row) => {
      const student = await getStudent(row.key);
      const tutorId = student?.tutorId ?? entries.find((e) => e.studentId === row.key)?.tutorId;
      return {
        row,
        name: student?.name ?? "Deleted student",
        tutor: (tutorId && tutors.get(tutorId)) || "—",
      };
    }),
  );

  return (
    <div className="stack-lg">
      <header>
        <Link href="/admin" className="t-small t-muted">
          ← Tutors
        </Link>
        <h1 className="t-display mt-2">Usage</h1>
        <p className="t-body t-muted mt-2">
          What the AI calls cost, estimated from the price table. Failed calls are
          counted too: they are paid for. Check the prices against the providers&apos;
          own pages before using these for anything that matters.
        </p>
      </header>

      <form method="get" className="flex flex-wrap items-center gap-2">
        <Link href={`/admin/usage?month=${shiftMonth(month, -1)}`} className="btn btn-quiet btn-sm">
          ← Earlier
        </Link>
        <input type="month" name="month" defaultValue={month} className="field w-auto" aria-label="Month" />
        <button type="submit" className="btn btn-soft btn-sm">
          Show
        </button>
        {month < monthOf() && (
          <Link href={`/admin/usage?month=${shiftMonth(month, 1)}`} className="btn btn-quiet btn-sm">
            Later →
          </Link>
        )}
      </form>

      {entries.length === 0 ? (
        <p className="empty p-6 t-small t-muted">Nothing was paid for in {month}.</p>
      ) : (
        <>
          <section className="grid gap-3 sm:grid-cols-3">
            <Stat label="Estimated cost" value={usd(summary.total.costUsd)} />
            <Stat
              label="Calls"
              value={count(summary.total.calls)}
              note={summary.total.failed ? `${count(summary.total.failed)} failed, ${usd(summary.total.failedUsd)}` : undefined}
            />
            <Stat
              label="Smart Review, average"
              value={review ? usd(review.averageUsd) : "—"}
              note={review ? `over ${count(review.lessons)} ${review.lessons === 1 ? "lesson" : "lessons"}` : "none this month"}
            />
          </section>

          <section className="space-y-3">
            <h2 className="t-subtitle">By purpose</h2>
            <Table
              head={["Purpose", "Calls", "Failed", "Tokens in / out", "Units", "Cost"]}
              rows={summary.byPurpose.map((row) => [
                PURPOSE_LABELS[row.key as UsagePurpose] ?? row.key,
                ...numbers(row),
              ])}
            />
            <p className="t-caption t-muted">
              Units are pictures drawn, seconds of audio heard, or pronunciation scores.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="t-subtitle">Students by cost</h2>
            {top.length === 0 ? (
              <p className="empty p-6 t-small t-muted">No calls this month were for a known student.</p>
            ) : (
              <Table
                head={["Student", "Tutor", "Calls", "Failed", "Cost"]}
                words={2}
                rows={top.map(({ row, name, tutor }) => [
                  name,
                  tutor,
                  count(row.calls),
                  count(row.failed),
                  usd(row.costUsd),
                ])}
              />
            )}
          </section>

          <section className="space-y-3">
            <h2 className="t-subtitle">By model</h2>
            <Table
              head={["Model", "Calls", "Failed", "Tokens in / out", "Units", "Cost"]}
              rows={summary.byModel.map((row) => [row.key, ...numbers(row)])}
            />
          </section>
        </>
      )}
    </div>
  );
}

function numbers(row: UsageRow): string[] {
  const tokens = row.inputTokens || row.outputTokens ? `${count(row.inputTokens)} / ${count(row.outputTokens)}` : "—";
  return [count(row.calls), count(row.failed), tokens, row.units ? count(row.units) : "—", usd(row.costUsd)];
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="card card-pad">
      <p className="t-caption t-muted">{label}</p>
      <p className="t-title t-num mt-1">{value}</p>
      {note && <p className="t-caption t-muted mt-1">{note}</p>}
    </div>
  );
}

/** The first `words` columns are words; the rest are figures, right-aligned to compare. */
function Table({ head, rows, words = 1 }: { head: string[]; rows: string[][]; words?: number }) {
  return (
    <div className="card overflow-x-auto">
      <table className="w-full t-small">
        <thead>
          <tr className="border-b border-line">
            {head.map((h, i) => (
              <th
                key={h}
                className={`px-4 py-2 t-caption t-muted font-medium whitespace-nowrap ${i < words ? "text-left" : "text-right"}`}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((cells, r) => (
            <tr key={r}>
              {cells.map((cell, i) => (
                <td
                  key={i}
                  className={`px-4 py-2 whitespace-nowrap ${i < words ? "text-left" : "text-right t-num"} ${i === 0 ? "font-medium" : ""}`}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
