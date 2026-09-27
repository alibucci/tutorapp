import { notFound } from "next/navigation";
import { getStudentByKey, listReports } from "@/lib/store";
import type { ParentReportBody } from "@/lib/types";

export const dynamic = "force-dynamic";

export const metadata = { title: "Weekly notes" };

const DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });

/**
 * The parent's screen.
 *
 * Two emphases on different channels, so they do not fight: the opening
 * paragraph is the largest thing because it answers "is this working?", and the
 * at-home block is the only accented surface because it is the only thing on
 * the page a parent actually does. Strengths and wins sit together on a warm
 * surface; what is still hard sits plainly, which is the honest treatment - it
 * is neither hidden nor dramatised.
 *
 * Older weeks collapse to a quieter card. This week is the one that matters.
 */
export default async function ParentView({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { key } = await params;
  const student = await getStudentByKey("parentKey", key);
  if (!student) notFound();

  const reports = (await listReports(student.id)).filter((r) => r.approvedAt);
  const [latest, ...older] = reports;

  return (
    <div className="stack-lg">
      <header>
        <h1 className="t-eyebrow">
          {student.name}
          {latest && (
            <>
              {" · "}
              {DATE.format(new Date(latest.weekStart))}&ndash;
              {DATE.format(new Date(latest.weekEnd))}
            </>
          )}
        </h1>
      </header>

      {!latest ? (
        <p className="empty">
          No notes yet. The first one arrives after a full week of lessons.
        </p>
      ) : (
        <>
          <article className="stack">
            <p className="t-lead">{latest.body.trajectory}</p>

            <Positives body={latest.body} />

            {latest.body.working.length > 0 && (
              <section>
                <h2 className="t-eyebrow mb-2">Still working on</h2>
                <List items={latest.body.working} />
              </section>
            )}

            {latest.body.atHome.length > 0 && (
              <section className="card card-focus card-pad">
                <h2 className="t-eyebrow">Things to try at home</h2>
                <ol className="mt-3 space-y-3">
                  {latest.body.atHome.map((item, i) => (
                    <li key={i} className="flex gap-3">
                      <span aria-hidden className="badge badge-lg mt-0.5">
                        {i + 1}
                      </span>
                      <span className="t-body">{item}</span>
                    </li>
                  ))}
                </ol>
              </section>
            )}
          </article>

          {older.length > 0 && (
            <section>
              <h2 className="t-eyebrow mb-3">Earlier weeks</h2>
              <div className="stack-sm">
                {older.map((report) => (
                  <details key={report.id} className="card card-pad">
                    <summary className="t-body cursor-pointer font-medium">
                      {DATE.format(new Date(report.weekStart))} &ndash;{" "}
                      {DATE.format(new Date(report.weekEnd))}
                    </summary>
                    <p className="t-small t-muted mt-3">
                      {report.body.trajectory}
                    </p>
                  </details>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

/** Strengths and wins share one warm surface - they answer the same question. */
function Positives({ body }: { body: ParentReportBody }) {
  if (!body.strengths.length && !body.wins.length) return null;
  return (
    <section
      className="card card-pad"
      style={{ background: "var(--live-soft)", borderColor: "transparent" }}
    >
      {body.wins.length > 0 && (
        <>
          <h2 className="t-eyebrow">What clicked this week</h2>
          <List items={body.wins} />
        </>
      )}
      {body.strengths.length > 0 && (
        <div className={body.wins.length ? "mt-5" : ""}>
          <h2 className="t-eyebrow">What they&rsquo;re good at</h2>
          <List items={body.strengths} />
        </div>
      )}
    </section>
  );
}

function List({ items }: { items: string[] }) {
  return (
    <ul className="mt-2 space-y-2">
      {items.map((item, i) => (
        <li key={i} className="t-body flex gap-3">
          <span
            aria-hidden
            className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ background: "var(--border-strong)" }}
          />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}
