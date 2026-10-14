import Link from "next/link";
import { pixelFont } from "@/lib/fonts";
import { gameStyle, paletteVars, skinOf } from "@/lib/gameStyles";
import { gameScore, homeworkDone, homeworkImageUrl } from "@/lib/homework";
import { listLessons } from "@/lib/store";
import type { Lesson, Skill, Student } from "@/lib/types";

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
  const quests = (await listLessons(student.id)).filter(
    (l) => l.homework?.sentAt,
  );
  const open = quests.filter((l) => !homeworkDone(l.homework));
  const finished = quests.filter((l) => homeworkDone(l.homework));
  const style = gameStyle(student.gameStyle);

  const working = student.skills.filter((s) => s.status !== "solid").slice(0, 3);
  const done = student.skills.filter((s) => s.status === "solid");
  const [first, ...rest] = working;

  return (
    <div className="stack-lg">
      <header>
        <p className="t-eyebrow">Hi, {student.name}</p>
        <h1 className="t-display mt-2">
          {open.length
            ? open.length === 1
              ? "A new quest is waiting."
              : `${open.length} quests are waiting.`
            : finished.length
              ? first
                ? "Quests done! Here's what's next."
                : "All quests done. Nice work!"
              : first
                ? "Here's what to work on."
                : "Nothing to do right now."}
        </h1>
      </header>

      {open.length > 0 && (
        <section className="space-y-2">
          {open.map((lesson) => (
            <Link
              key={lesson.id}
              href={questHref(lesson.id)}
              className={`game-entry game-entry-${skinOf(style)} ${pixelFont.variable}`}
              style={paletteVars(style) as React.CSSProperties}
            >
              <span>
                <span className="game-entry-kicker">{style.name} homework</span>
                <span className="game-entry-title">Describe the picture</span>
                <span className="game-entry-meta">
                  From {lesson.title} · {taskCount(lesson)}
                </span>
              </span>
              <span aria-hidden className="game-entry-title">→</span>
            </Link>
          ))}
        </section>
      )}

      {done.length > 0 && (
        // What they have actually won. Same frame the level bar used, because
        // that is the spot on the screen a child looks at first.
        <section
          className={`game-stats game-stats-${skinOf(style)} ${pixelFont.variable}`}
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
          <h2 className="t-eyebrow mb-3">Quests you have done</h2>
          <ul className="space-y-2.5">
            {finished.map((lesson) => {
              const src = homeworkImageUrl(lesson, linkKey);
              const score = gameScore(lesson.homework);
              return (
                <li key={lesson.id}>
                  <Link href={questHref(lesson.id)} className="quest-row card card-press">
                    <span
                      className={`quest-row-face quest-row-face-${skinOf(style)}`}
                      style={paletteVars(style) as React.CSSProperties}
                    >
                      {src ? (
                        // eslint-disable-next-line @next/next/no-img-element -- private upload
                        <img src={src} alt="" className="quest-row-img" />
                      ) : (
                        <span className={`quest-row-games ${pixelFont.variable}`}>
                          {lesson.homework?.exercises?.length ?? 0}
                        </span>
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{lesson.title}</span>
                      <span className="block t-small t-muted">
                        {score.total > 0
                          ? `${score.right} of ${score.total} right`
                          : taskCount(lesson)}
                      </span>
                      <span className="mt-1 block t-small font-semibold text-accent">
                        Play again →
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
