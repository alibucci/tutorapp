import Link from "next/link";
import { notFound } from "next/navigation";
import { PilotNote, PilotSetup } from "@/components/PilotControls";
import { ChevronLeft } from "@/components/ui";
import { studentFor } from "@/lib/access";
import { pilotMonths, pilotReport, type PilotWeek } from "@/lib/pilot";
import { listLessons } from "@/lib/store";
import { learningOpenTo } from "@/lib/tutorList";
import { readUsage } from "@/lib/usage";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pilot" };

const share = (x: { right: number; total: number }) => (x.total ? `${x.right} of ${x.total}` : "-");
const usd = (n: number) => (n ? `$${n.toFixed(n >= 1 ? 2 : 3)}` : "-");
const hrs = (h: number | null) => (h === null ? "-" : h < 24 ? `${Math.round(h)} h` : `${(h / 24).toFixed(1)} days`);

type Column = Omit<PilotWeek, "label" | "key">;

const ROWS: { label: string; hint: string; get: (w: Column) => string }[] = [
  { label: "Finished", hint: "of homework and Smart Reviews sent that week", get: (w) => (w.sent ? `${w.finished} of ${w.sent}` : "-") },
  { label: "Time to finish", hint: "middle value, from sent to the last game", get: (w) => hrs(w.hoursToFinish) },
  { label: "Right first time", hint: "every game, marked answers only", get: (w) => share(w.firstGo) },
  { label: "Retention", hint: "right first time in Smart Reviews - earlier material", get: (w) => share(w.retention) },
  { label: "Mistakes", hint: "and how many on a skill that had mistakes before", get: (w) => (w.mistakes ? `${w.mistakes} (${w.repeated} again)` : "-") },
  { label: "Active days", hint: "days a game was finished", get: (w) => String(w.activeDays || "-") },
  { label: "Replays", hint: "games played again by choice", get: (w) => String(w.replays || "-") },
  { label: "Your work", hint: "reviews approved · rebuilt · briefs written", get: (w) => `${w.approvals} · ${w.rebuilds} · ${w.briefs}` },
  { label: "AI cost", hint: "everything for this child (practice between lessons)", get: (w) => `${usd(w.costUsd)} (${usd(w.practiceCostUsd)})` },
];

/**
 * A pilot of practice between lessons, measured: how many tasks a week and how
 * long, whether the child does them and likes them, whether mistakes stop
 * coming back and earlier material holds, what it asks of the tutor, and what
 * it costs. Only what the app recorded; what the parent says is in the notes.
 */
export default async function PilotPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const found = await studentFor(id);
  if (!found || !(await learningOpenTo(found.student.tutorId))) notFound();
  const { student } = found;
  const pilot = student.pilot;
  const report = pilot
    ? pilotReport(
        student,
        await listLessons(id),
        (await Promise.all(pilotMonths(pilot.startedAt, pilot.weeks).map(readUsage))).flat(),
        pilot.startedAt,
        pilot.weeks,
      )
    : null;
  const columns: (Column & { label: string; key: string })[] = report
    ? [...report.weeks, { ...report.total, label: "All", key: "all" }]
    : [];

  return (
    <div className="stack-lg max-w-5xl">
      <header className="flex items-center gap-2 -ml-3">
        <Link href={`/student/${id}`} aria-label={`Back to ${student.name}`} className="grid h-11 w-11 shrink-0 place-items-center rounded-[var(--radius)]">
          <ChevronLeft />
        </Link>
        <span>
          <p className="t-small t-muted">{student.name}</p>
          <h1 className="t-title">Pilot: practice between lessons</h1>
        </span>
      </header>

      <section className="card card-pad stack-sm">
        <p className="t-small t-muted">
          What the pilot is for: how many tasks a week and how long, whether {student.name} does them and enjoys them, whether mistakes
          stop coming back and earlier material holds, what it asks of you, and what it costs. Recorded data only; what the parent says
          goes in the notes below.
        </p>
        <PilotSetup studentId={id} pilot={pilot} today={new Date().toISOString().slice(0, 10)} />
      </section>

      {report && (
        <section className="card overflow-x-auto">
          <table className="w-full t-small">
            <thead>
              <tr className="text-left t-muted">
                <th className="p-3">Week</th>
                {columns.map((c) => (
                  <th key={c.key} className="p-3 text-right whitespace-nowrap">
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((r) => (
                <tr key={r.label} className="border-t border-line">
                  <td className="p-3">
                    <span className="font-medium">{r.label}</span>
                    <span className="block t-caption t-muted">{r.hint}</span>
                  </td>
                  {columns.map((c) => (
                    <td key={c.key} className="p-3 text-right tabular-nums whitespace-nowrap">
                      {r.get(c)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {report && report.weeks.length > 0 && (
        <section className="space-y-3">
          <h2 className="t-title">Notes, week by week</h2>
          {report.weeks.map((w) => {
            const n = pilot?.notes.find((x) => x.week === w.key);
            return (
              <div key={w.key} className="card card-pad stack-sm">
                <p className="font-medium">{w.label}</p>
                <PilotNote studentId={id} week={w.key} parent={n?.parent} tutor={n?.tutor} />
              </div>
            );
          })}
        </section>
      )}
    </div>
  );
}
