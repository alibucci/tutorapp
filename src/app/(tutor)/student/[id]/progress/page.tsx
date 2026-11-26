import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "@/components/ui";
import { studentFor } from "@/lib/access";
import { listLessons } from "@/lib/store";
import { tutorTimeline } from "@/lib/timeline";
import { SKILL_STATUS_LABEL, type SkillStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

const DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });
const TAG: Record<SkillStatus, string> = { struggling: "tag-warn", improving: "tag-info", solid: "tag-done" };

/** The child's lessons in order, with what was really recorded about each. */
export default async function ProgressPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const found = await studentFor(id);
  if (!found) notFound();
  const { student } = found;
  const t = tutorTimeline(student, await listLessons(id));

  return (
    <div className="stack-lg max-w-3xl">
      <header className="flex items-center gap-2 -ml-3">
        <Link href={`/student/${id}`} aria-label={`Back to ${student.name}`} className="grid h-11 w-11 shrink-0 place-items-center rounded-[var(--radius)]">
          <ChevronLeft />
        </Link>
        <span className="min-w-0">
          <p className="t-small t-muted">{student.name}</p>
          <h1 className="t-title">Progress</h1>
        </span>
      </header>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat n={t.taught} label={t.taught === 1 ? "lesson" : "lessons"} />
        <Stat n={t.homeworkDone} label="homework done" />
        <Stat n={t.solid} label={t.solid === 1 ? "topic solid" : "topics solid"} />
        <Stat n={t.working} label="topics in progress" />
      </section>

      {t.items.length === 0 ? (
        <p className="empty">Nothing yet. Each lesson appears here once it has been reviewed.</p>
      ) : (
        <ol className="stack">
          {t.items.map((it) => (
            <li key={it.id} className="card card-pad stack-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <Link href={`/lesson/${it.id}/review`} className="font-semibold underline-offset-2 hover:underline">
                  {it.title}
                </Link>
                <span className="t-small t-muted">
                  {DATE.format(new Date(it.date))} · {it.kind}
                </span>
              </div>
              {it.covered.length > 0 && (
                <p className="t-small">
                  <span className="t-muted">Covered: </span>
                  {it.covered.join(" · ")}
                </p>
              )}
              {it.line && <p className="t-small t-muted">{it.line}</p>}
              <div className="flex flex-wrap items-center gap-2">
                {it.score ? (
                  <span className="tag tag-done">
                    Homework {it.score.right}/{it.score.total} right
                  </span>
                ) : it.homeworkOpen ? (
                  <span className="tag tag-quiet">Homework sent, not done yet</span>
                ) : null}
                {it.topics.map((s) => (
                  <span key={s.topic} className={`tag ${TAG[s.status]}`} title={SKILL_STATUS_LABEL[s.status]}>
                    {s.topic} · {SKILL_STATUS_LABEL[s.status].toLowerCase()}
                  </span>
                ))}
              </div>
            </li>
          ))}
        </ol>
      )}
      <p className="hint">
        Topic labels are where each topic stands now. They are the tutor&rsquo;s and the summary&rsquo;s judgement, not a test score.
      </p>
    </div>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <div className="card card-pad">
      <p className="t-title t-num">{n}</p>
      <p className="t-small t-muted">{label}</p>
    </div>
  );
}
