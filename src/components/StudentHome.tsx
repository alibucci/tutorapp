import Link from "next/link";
import { gameFonts } from "@/lib/fonts";
import { paletteVars, skinOf, styleFor, themeOf } from "@/lib/gameStyles";
import { gameScore, homeworkDone, homeworkImageUrl } from "@/lib/homework";
import { listLessons } from "@/lib/store";
import { learningOpenTo } from "@/lib/tutorList";
import type { Lesson, Skill, Student } from "@/lib/types";
import { type StudentWeek, plannedMinutes, studentWeek } from "@/lib/week";

/**
 * The student's own screen.
 *
 * Hierarchy is deliberate: homework waiting is the entry point, then the
 * first goal, because "what do I do now" is the only question a child brings
 * here. The greeting is a
 * courtesy and is sized like one. Goals two and three are listed rather than
 * carded so they cannot compete, and exactly one surface on the screen carries
 * the accent - if everything is highlighted, nothing is.
 *
 * There is no level and no XP here. Points belong inside a game, where they
 * mean "answers you got right"; a second kind of point on this screen only
 * made one word mean two things, and a level that unlocks nothing is
 * decoration pretending to be a system. What a child has actually won is the
 * list of things they can now do, so that is what the screen shows.
 */
export async function StudentHome({
  student,
  questHref,
  linkKey,
}: {
  student: Student;
  /** Where one lesson's homework opens, for this way of getting in. */
  questHref: (lessonId: string) => string;
  /** The private link's key, when the child came in by link. */
  linkKey?: string;
}) {
  const lessons = await listLessons(student.id);
  const quests = lessons.filter(
    (l) => l.homework?.sentAt,
  );
  const open = quests.filter((l) => !homeworkDone(l.homework));
  const finished = quests.filter((l) => homeworkDone(l.homework));
  const style = styleFor(student);

  const working = student.skills.filter((s) => s.status !== "solid").slice(0, 3);
  const done = student.skills.filter((s) => s.status === "solid");
  const [first, ...rest] = working;
  // The weekly strip is part of continuous learning: without it the screen
  // stays exactly as it was.
  const learning = (await learningOpenTo(student.tutorId)) ? studentWeek(student, lessons) : null;

  return (
    <div className="stack-lg">
      <header>
        <p className="t-eyebrow">Hi, {student.name}</p>
        <h1 className="t-display mt-2">
          {open.length
            ? open.length === 1
              ? style.plain
                ? "New homework is waiting."
                : "A new quest is waiting."
              : style.plain
                ? `${open.length} homeworks are waiting.`
                : `${open.length} quests are waiting.`
            : finished.length
              ? first
                ? style.plain
                  ? "Homework done. Here's what's next."
                  : "Quests done! Here's what's next."
                : style.plain
                  ? "All homework done."
                  : "All quests done. Nice work!"
              : first
                ? "Here's what to work on."
                : "Nothing to do right now."}
        </h1>
      </header>

      {learning ? (
        <WeekStrip week={learning} style={style} questHref={questHref} hasQuests={quests.length > 0} />
      ) : (
        open.length > 0 && (
          <section className="space-y-2">
            {open.map((lesson) => (
              <QuestEntry key={lesson.id} lesson={lesson} style={style} href={questHref(lesson.id)} />
            ))}
          </section>
        )
      )}

      {done.length > 0 && (
        // What they have actually won. Same frame the level bar used, because
        // that is the spot on the screen a child looks at first.
        <section
          className={`game-stats game-stats-${skinOf(style)} ${themeOf(style)} ${gameFonts}`}
          style={paletteVars(style) as React.CSSProperties}
        >
          <div className="flex items-baseline justify-between gap-3">
            <span className="game-stats-level">You&rsquo;ve learned</span>
            <span className="game-stats-xp">{done.length}</span>
          </div>
          <ul className="collection">
            {done.map((skill) => (
              <li key={skill.topic} className="collection-item">
                {skill.topic}
              </li>
            ))}
          </ul>
        </section>
      )}

      {!first && done.length === 0 && quests.length === 0 && (
        <p className="empty">
          Nothing here yet. It fills in after your next lesson.
        </p>
      )}

      {first && <FocusGoal skill={first} />}

      {rest.length > 0 && (
        <section>
          <h2 className="t-eyebrow mb-1">After that</h2>
          <div>
            {rest.map((skill, i) => (
              <Minor key={skill.topic} skill={skill} index={i + 2} />
            ))}
          </div>
        </section>
      )}

      {finished.length > 0 && (
        <section>
          <h2 className="t-eyebrow mb-3">{style.plain ? "Done" : "Quests you have done"}</h2>
          <ul className="space-y-2.5">
            {finished.map((lesson) => {
              const src = homeworkImageUrl(lesson, linkKey);
              const score = gameScore(lesson.homework);
              return (
                <li key={lesson.id}>
                  <Link href={questHref(lesson.id)} className="quest-row card card-press">
                    <span
                      className={`quest-row-face quest-row-face-${skinOf(style)} ${themeOf(style)} ${gameFonts}`}
                      style={paletteVars(style) as React.CSSProperties}
                    >
                      {src ? (
                        // eslint-disable-next-line @next/next/no-img-element -- private upload
                        <img src={src} alt="" className="quest-row-img" />
                      ) : (
                        <span className="quest-row-games">
                          {lesson.homework?.exercises?.length ?? 0}
                        </span>
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">
                        {learning && lesson.review ? practiceTitle(lesson) : lesson.title}
                      </span>
                      <span className="block t-small t-muted">
                        {score.total > 0
                          ? `${score.right} of ${score.total} right`
                          : taskCount(lesson)}
                      </span>
                      <span className="mt-1 block t-small font-semibold text-accent">
                        {style.plain ? "Open again →" : "Play again →"}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

    </div>
  );
}

type Style = ReturnType<typeof styleFor>;

const DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });

/** A Smart Review, as the child knows it: practice, not a system's name. */
function practiceTitle(lesson: Lesson): string {
  return `Practice · ${DATE.format(new Date(lesson.homework?.sentAt ?? lesson.createdAt))}`;
}

/**
 * The doorway into one homework, in the game's world. With `learning` on, a
 * Smart Review is shown as plain practice with how long it should take -
 * the only homework whose length is known.
 */
function QuestEntry({ lesson, style, href, learning = false }: { lesson: Lesson; style: Style; href: string; learning?: boolean }) {
  const practice = learning && lesson.review;
  const minutes = plannedMinutes(lesson);
  return (
    <Link
      href={href}
      className={`game-entry game-entry-${skinOf(style)} ${themeOf(style)} ${gameFonts}`}
      style={paletteVars(style) as React.CSSProperties}
    >
      <span>
        <span className="game-entry-kicker">
          {practice
            ? style.plain ? "Practice" : `${style.name} practice`
            : lesson.module ? "Bible story" : style.plain ? "Homework" : `${style.name} homework`}
        </span>
        <span className="game-entry-title">
          {lesson.module
            ? lesson.title
            : lesson.homework?.imageFile
            ? "Describe the picture"
            : style.plain
              ? `${lesson.homework?.exercises?.length ?? 0} ${
                  lesson.homework?.exercises?.length === 1 ? "task" : "tasks"
                }`
              : `${lesson.homework?.exercises?.length ?? 0} quick ${
                  lesson.homework?.exercises?.length === 1 ? "game" : "games"
                }`}
        </span>
        <span className="game-entry-meta">
          {practice
            ? `${minutes ? `About ${minutes} minutes · ` : ""}${taskCount(lesson)}`
            : `From ${lesson.title} · ${taskCount(lesson)}`}
        </span>
      </span>
      <span aria-hidden className="game-entry-title">→</span>
    </Link>
  );
}

/**
 * This week, in one compact block: how many quests are done since Monday,
 * the one to do now, and when the next practice comes - its day and time
 * only, because what it holds is not made until then. Anything else open
 * folds behind a count, so a child never faces a pile.
 */
function WeekStrip({
  week,
  style,
  questHref,
  hasQuests,
}: {
  week: StudentWeek;
  style: Style;
  questHref: (lessonId: string) => string;
  hasQuests: boolean;
}) {
  if (!hasQuests && !week.next) return null;
  const note = week.current
    ? week.next
      ? `Next practice ${week.next}.`
      : style.plain
        ? "Start with this one."
        : "Start with this quest."
    : !hasQuests
      ? `Your first practice comes ${week.next}.`
      : week.next
        ? `All done for now - next practice ${week.next}.`
        : "All done for now.";
  const more = week.others.length;
  return (
    <section className="space-y-2">
      <div
        className={`game-stats game-stats-${skinOf(style)} ${themeOf(style)} ${gameFonts}`}
        style={paletteVars(style) as React.CSSProperties}
      >
        <div className="flex items-baseline justify-between gap-3">
          <span className="game-stats-level">This week</span>
          {week.doneCount > 0 && <span className="game-stats-xp">{week.doneCount} done</span>}
        </div>
        <p className="game-stats-note">{note}</p>
      </div>

      {week.current && <QuestEntry lesson={week.current} style={style} href={questHref(week.current.id)} learning />}

      {more > 0 && (
        <details>
          <summary className="cursor-pointer px-1 py-1 t-small font-semibold text-accent">
            {more} more {style.plain ? "waiting" : more === 1 ? "quest waiting" : "quests waiting"}
          </summary>
          <div className="mt-2 space-y-2">
            {week.others.map((lesson) => (
              <QuestEntry key={lesson.id} lesson={lesson} style={style} href={questHref(lesson.id)} learning />
            ))}
          </div>
        </details>
      )}
    </section>
  );
}

/** "3 games", or "3 games and a picture" - whatever this homework holds. */
function taskCount(lesson: Lesson): string {
  const games = lesson.homework?.exercises?.length ?? 0;
  const picture = Boolean(lesson.homework?.imageFile);
  const parts = [games > 0 ? `${games} ${games === 1 ? "game" : "games"}` : null];
  if (picture) parts.push("a picture");
  return parts.filter(Boolean).join(" and ") || "a picture";
}

/** The entry point. The only accented surface on the screen. */
function FocusGoal({ skill }: { skill: Skill }) {
  return (
    <section className="card card-focus overflow-hidden">
      <div className="p-5 sm:p-7">
        <div className="flex items-center gap-3">
          <span aria-hidden className="badge badge-lg">
            1
          </span>
          <p className="t-eyebrow">Start here</p>
        </div>
        <h2 className="t-title mt-4">{skill.topic}</h2>
        <p className="t-body t-muted mt-2 measure">{skill.note}</p>
      </div>

      {skill.practice && (
        <div className="border-t border-line bg-surface px-5 py-5 sm:px-7">
          <p className="t-eyebrow">Try this</p>
          <p className="t-subtitle mt-2 font-normal">{skill.practice}</p>
        </div>
      )}
    </section>
  );
}

/** Listed, not carded - these are next, not now. */
function Minor({ skill, index }: { skill: Skill; index: number }) {
  return (
    <div className="minor">
      <span aria-hidden className="badge badge-sm mt-0.5">
        {index}
      </span>
      <div className="min-w-0">
        <p className="t-body font-medium">{skill.topic}</p>
        <p className="t-small t-muted mt-0.5">{skill.note}</p>
      </div>
    </div>
  );
}
