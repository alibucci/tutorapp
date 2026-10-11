import { homeworkImageUrl } from "@/lib/homework";
import { listLessons, listReports } from "@/lib/store";
import { HOMEWORK_TASKS, type Lesson, type ParentReportBody, type Student } from "@/lib/types";

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
export async function ParentHome({
  student,
  linkKey,
}: {
  student: Student;
  /** The parent's private link key, when they came in by link. */
  linkKey?: string;
}) {
  const reports = (await listReports(student.id)).filter((r) => r.approvedAt);
  const [latest, ...older] = reports;
  const homework = (await listLessons(student.id)).filter((l) => l.homework?.sentAt);

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
        <p className={homework.length ? "t-small t-muted" : "empty"}>
          No weekly note yet. The first one arrives after a full week of lessons.
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

      <HomeworkHistory lessons={homework} name={student.name} linkKey={linkKey} />
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

/**
 * Every homework sent, newest first: what the child was asked to look at and
 * what they wrote. The parent sees the picture and the answers only once the
 * child has handed it in.
 */
function HomeworkHistory({
  lessons,
  name,
  linkKey,
}: {
  lessons: Lesson[];
  name: string;
  linkKey?: string;
}) {
  if (lessons.length === 0) return null;
  const done = lessons.filter((l) => l.homework?.answers).length;
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="t-title">Homework</h2>
        <span className="t-small t-muted">
          {done} of {lessons.length} done
        </span>
      </div>
      <ul className="space-y-3">
        {lessons.map((lesson) => {
          const answers = lesson.homework?.answers;
          const src = answers ? homeworkImageUrl(lesson, linkKey) : null;
          return (
            <li key={lesson.id} className="card overflow-hidden">
              <div className="flex items-center justify-between gap-3 px-4 pt-4">
                <span className="font-semibold">
                  {lesson.title}
                  <span className="font-normal t-muted">
                    {" · "}
                    {DATE.format(new Date(lesson.homework!.sentAt!))}
                  </span>
                </span>
                <span className={`tag ${answers ? "tag-done" : "tag-warn"}`}>
                  {answers ? "Done" : `Waiting for ${name}`}
                </span>
              </div>
              {answers ? (
                <div className="space-y-3 p-4">
                  {src && (
                    // eslint-disable-next-line @next/next/no-img-element -- private upload
                    <img
                      src={src}
                      alt="The homework picture"
                      className="max-h-56 w-full rounded-[var(--radius)] bg-sunken object-cover"
                    />
                  )}
                  <Answer label={HOMEWORK_TASKS[0].prompt} text={answers.describe} />
                  <Answer label={HOMEWORK_TASKS[1].prompt} text={answers.next} />
                  <div>
                    <p className="t-small t-muted">Three words for the picture</p>
                    <ul className="mt-1.5 flex flex-wrap gap-1.5">
                      {answers.adjectives.map((a, i) => (
                        <li key={i} className="tag tag-info">
                          {a}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ) : (
                <p className="px-4 pb-4 pt-2 t-small t-muted">
                  {name} will describe a picture and say what happens next.
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Answer({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <p className="t-small t-muted">{label}</p>
      <p className="mt-1 whitespace-pre-wrap">{text}</p>
    </div>
  );
}
