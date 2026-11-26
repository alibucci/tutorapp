import { gameScore, homeworkDone, homeworkImageUrl, progressByTopic, resultScore } from "@/lib/homework";
import { listLessons, listReports } from "@/lib/store";
import { parentTimeline, type ParentItem } from "@/lib/timeline";
import { learningOpenTo } from "@/lib/tutorList";
import {
  EXERCISE_LABEL,
  HOMEWORK_TASKS,
  type Lesson,
  type ParentReportBody,
  type Skill,
  type Student,
} from "@/lib/types";
import { ACTIVITY_LABEL, type ActivityKind, type ParentWeek, activityKind, parentWeek, plannedMinutes } from "@/lib/week";

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
  const lessons = await listLessons(student.id);
  const homework = lessons.filter((l) => l.homework?.sentAt);
  const timeline = parentTimeline(lessons);
  // "This week" is part of continuous learning: without it the page stays as it was.
  const week = (await learningOpenTo(student.tutorId)) ? parentWeekIfAny(student, lessons, homework.length > 0) : null;

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

      {week && <ThisWeek week={week} name={student.name} />}

      <LessonTimeline items={timeline} />

      <HomeworkHistory lessons={homework} name={student.name} linkKey={linkKey} learning={Boolean(week)} />
    </div>
  );
}

/** The week, unless there is nothing at all to say about it yet. */
function parentWeekIfAny(student: Student, lessons: Lesson[], anyHomework: boolean): ParentWeek | null {
  // Every lesson, drafts included: a Smart Review waiting for the tutor holds the next one back.
  const week = parentWeek(student, lessons);
  const learnt = week.focus.practice.length + week.focus.coming.length + week.focus.solid.length;
  return anyHomework || week.plan || learnt ? week : null;
}

/** "after the lesson", "2 Bible stories" - each kind of activity, in a sentence. */
const PHRASE: Record<ActivityKind, (n: number) => string> = {
  lesson: (n) => `${n} after the lesson`,
  review: (n) => `${n} practice between lessons`,
  story: (n) => `${n} Bible ${n === 1 ? "story" : "stories"}`,
  extra: (n) => `${n} extra homework`,
};

/**
 * This week, kept as three different things on purpose: what was done (an
 * activity is finished or not), how the answers went (only rounds that were
 * marked), and what is learnt (the tutor's word from lessons). Game points are
 * practice, not proof, so nothing here says a child "knows" something because
 * of a game - and a game not played yet is never shown as a wrong answer.
 */
function ThisWeek({ week, name }: { week: ParentWeek; name: string }) {
  const { current, focus } = week;
  const parts = (Object.keys(PHRASE) as ActivityKind[])
    .filter((k) => week.doneBy[k] > 0)
    .map((k) => PHRASE[k](week.doneBy[k]));
  const reviewOpen = current && activityKind(current) === "review";
  const learnt = focus.practice.length + focus.coming.length + focus.solid.length > 0;
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="t-title">This week</h2>
        <span className="t-small t-muted tabular-nums">{week.label}</span>
      </div>

      <div className="card card-pad space-y-5">
        <div>
          <p className="t-eyebrow">Now</p>
          {current ? (
            <CurrentActivity lesson={current} name={name} />
          ) : (
            <p className="t-body mt-2">Nothing waiting - {name} is all caught up.</p>
          )}
          {week.waiting > 0 && (
            <p className="t-small t-muted mt-2">
              {week.waiting} more {week.waiting === 1 ? "is" : "are"} waiting after this one.
            </p>
          )}
        </div>

        <div>
          <p className="t-eyebrow">Done this week</p>
          <p className="t-body mt-2">
            {parts.length
              ? `${week.done.length} ${week.done.length === 1 ? "activity" : "activities"} finished: ${parts.join(", ")}.`
              : "Nothing finished yet this week."}
          </p>
          {week.answered.total > 0 && (
            <p className="t-small mt-1">
              In the games this week, {name} answered {week.answered.right} of {week.answered.total} right the first
              time.
            </p>
          )}
          <p className="t-small t-muted mt-1">Games not played yet are left out - they never count as wrong answers.</p>
        </div>

        {(week.next || week.plan) && (
          <div>
            <p className="t-eyebrow">Coming up</p>
            <p className="t-body mt-2">
              {week.next
                ? `Next practice between lessons: ${week.next}.`
                : reviewOpen
                  ? "The next practice comes once this one is finished."
                  : "The next practice is being planned."}
            </p>
            {week.plan && <p className="t-small t-muted mt-1">Planned: {week.plan}.</p>}
          </div>
        )}
      </div>

      {learnt && (
        <div className="card card-pad space-y-4">
          <div>
            <p className="font-semibold">What {name} is learning</p>
            <p className="t-small t-muted mt-0.5">
              From what the tutor saw in lessons. The games bring things back for practice; they do not decide
              what is learnt.
            </p>
          </div>
          <FocusGroup title="Needs more practice" skills={focus.practice} tone="tag-quiet" />
          <FocusGroup title="Coming along" skills={focus.coming} tone="tag-info" />
          <FocusGroup title="Solid in lessons" skills={focus.solid} tone="tag-done" />
        </div>
      )}
    </section>
  );
}

/** The one activity to do now: what it is, when it went out, whether it has begun. */
function CurrentActivity({ lesson, name }: { lesson: Lesson; name: string }) {
  const kind = activityKind(lesson);
  const minutes = plannedMinutes(lesson);
  const homework = lesson.homework!;
  const played = homework.results?.length ?? 0;
  const games = homework.exercises?.length ?? 0;
  const meta = [
    kind === "review" ? `Going back over what ${name} has learnt` : ACTIVITY_LABEL[kind],
    `sent ${DATE.format(new Date(homework.sentAt!))}`,
    minutes ? `about ${minutes} minutes` : null,
  ].filter(Boolean);
  return (
    <div className="mt-2 flex items-start justify-between gap-3">
      <span className="min-w-0">
        <span className="block font-medium">{kind === "review" ? ACTIVITY_LABEL.review : lesson.title}</span>
        <span className="block t-small t-muted">{meta.join(" · ")}</span>
      </span>
      <span className={`tag ${played ? "tag-info" : "tag-quiet"}`}>
        {played ? `${played} of ${games} games played` : "Not started yet"}
      </span>
    </div>
  );
}

/** A few skills under one plain heading; a long list folds into a count. */
function FocusGroup({ title, skills, tone }: { title: string; skills: Skill[]; tone: string }) {
  if (skills.length === 0) return null;
  const SHOWN = 6;
  return (
    <div>
      <p className="t-small t-muted">{title}</p>
      <ul className="mt-1.5 flex flex-wrap gap-1.5">
        {skills.slice(0, SHOWN).map((s) => (
          <li key={s.id ?? s.topic} className={`tag ${tone} whitespace-normal`}>
            {s.topic}
          </li>
        ))}
        {skills.length > SHOWN && <li className="tag tag-quiet">+{skills.length - SHOWN} more</li>}
      </ul>
    </div>
  );
}

/**
 * Every lesson the tutor has sent a note about, newest first: the date, what
 * it was, and the first line of that note. The latest few are open; the rest
 * fold away so the page stays short.
 */
function LessonTimeline({ items }: { items: ParentItem[] }) {
  if (items.length === 0) return null;
  const OPEN = 5;
  const row = (it: ParentItem) => (
    <li key={it.id} className="flex gap-3">
      <span className="t-small t-muted w-14 shrink-0 tabular-nums pt-0.5">{DATE.format(new Date(it.date))}</span>
      <span className="min-w-0">
        <span className="block font-medium">{it.title}</span>
        <span className="block t-small t-muted">{it.line}</span>
        {it.score && <span className="block t-small mt-0.5">Homework: {it.score.right} of {it.score.total} right</span>}
      </span>
    </li>
  );
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="t-title">Lessons so far</h2>
        <span className="t-small t-muted">{items.length}</span>
      </div>
      <ol className="card card-pad space-y-4">{items.slice(0, OPEN).map(row)}</ol>
      {items.length > OPEN && (
        <details className="card card-pad">
          <summary className="cursor-pointer t-small font-medium">Earlier lessons ({items.length - OPEN})</summary>
          <ol className="mt-4 space-y-4">{items.slice(OPEN).map(row)}</ol>
        </details>
      )}
    </section>
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
  learning = false,
}: {
  lessons: Lesson[];
  name: string;
  linkKey?: string;
  /** Continuous learning is on: a Smart Review is named as the family knows it. */
  learning?: boolean;
}) {
  if (lessons.length === 0) return null;
  const done = lessons.filter((l) => homeworkDone(l.homework)).length;
  const topics = progressByTopic(lessons);

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="t-title">Homework</h2>
        <span className="t-small t-muted">
          {done} of {lessons.length} done
        </span>
      </div>

      {topics.length > 0 && (
        <div className="card space-y-4 p-4">
          <div>
            <p className="font-semibold">How the practice is going</p>
            <p className="t-small t-muted mt-0.5">
              Out of every question {name} has answered in the games. The one at
              the top is worth ten minutes at home.
            </p>
          </div>
          <ul className="space-y-3">
            {topics.map((t) => (
              <li key={t.topic}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="t-small font-medium">{t.topic}</span>
                  <span className="t-small t-muted tabular-nums">
                    {t.right}/{t.total} · {t.percent}%
                  </span>
                </div>
                <Bar percent={t.percent} />
              </li>
            ))}
          </ul>
        </div>
      )}

      <ul className="space-y-3">
        {lessons.map((lesson) => {
          const homework = lesson.homework!;
          const finished = homeworkDone(homework);
          const answers = homework.answers;
          const src = finished ? homeworkImageUrl(lesson, linkKey) : null;
          const score = gameScore(homework);
          return (
            <li key={lesson.id} className="card overflow-hidden">
              <div className="flex items-center justify-between gap-3 px-4 pt-4">
                <span className="font-semibold">
                  {learning && lesson.review ? ACTIVITY_LABEL.review : lesson.title}
                  <span className="font-normal t-muted">
                    {" · "}
                    {DATE.format(new Date(homework.sentAt!))}
                  </span>
                </span>
                <span className={`tag ${finished ? "tag-done" : "tag-warn"}`}>
                  {finished ? "Done" : `Waiting for ${name}`}
                </span>
              </div>

              {(homework.results ?? []).length > 0 && (
                <div className="space-y-2.5 px-4 pt-3">
                  {(homework.results ?? []).map((result) => {
                    const r = resultScore(result);
                    // Nothing marked (skipped, or not heard) is no score at all - not 0%.
                    if (!r.total) return null;
                    const percent = Math.round((r.right / r.total) * 100);
                    return (
                      <div key={result.kind}>
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="t-small">{EXERCISE_LABEL[result.kind]}</span>
                          <span className="t-small t-muted tabular-nums">
                            {r.right}/{r.total}
                          </span>
                        </div>
                        <Bar percent={percent} />
                      </div>
                    );
                  })}
                  {score.total > 0 && (
                    <p className="t-small t-muted">
                      {score.right} right out of {score.total} in the games.
                    </p>
                  )}
                </div>
              )}

              {finished && answers ? (
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
                  {finished
                    ? `${name} finished the games.`
                    : homework.imageFile
                      ? `${name} will play the games and describe a picture.`
                      : `${name} will play the games.`}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** One progress bar. Green when it is going well, amber when it is not. */
function Bar({ percent }: { percent: number }) {
  return (
    <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-sunken">
      <div
        className="h-full rounded-full"
        style={{
          width: `${Math.max(3, percent)}%`,
          background: percent >= 70 ? "var(--live)" : percent >= 40 ? "var(--info)" : "var(--warn)",
        }}
      />
    </div>
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
