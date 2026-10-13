import Link from "next/link";
import { pixelFont } from "@/lib/fonts";
import { gameStyle, paletteVars, skinOf } from "@/lib/gameStyles";
import {
  XP_PER_LEVEL,
  XP_PER_QUEST,
  gameScore,
  homeworkDone,
  homeworkImageUrl,
} from "@/lib/homework";
import { listLessons } from "@/lib/store";
import type { Skill, Student } from "@/lib/types";

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
 * The count of things already beaten is the largest number on the page. It is
 * the only reason anyone opens this twice.
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

  const xp = finished.length * XP_PER_QUEST;
  const level = Math.floor(xp / XP_PER_LEVEL) + 1;
  const toNext = (xp % XP_PER_LEVEL) / XP_PER_LEVEL;

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
                : "Nothing outstanding right now."}
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
                  From {lesson.title} · 3 tasks · {XP_PER_QUEST} {style.words.reward}
                </span>
              </span>
              <span aria-hidden className="game-entry-title">→</span>
            </Link>
          ))}
        </section>
      )}

      {finished.length > 0 && (
        // Progress, the way the game shows it: a level and a filling bar.
        <section
          className={`game-stats game-stats-${skinOf(style)} ${pixelFont.variable}`}
          style={paletteVars(style) as React.CSSProperties}
        >
          <div className="flex items-baseline justify-between gap-3">
            <span className="game-stats-level">Level {level}</span>
            <span className="game-stats-xp">
              {xp} {style.words.reward}
            </span>
          </div>
          <div className="game-stats-bar" aria-label={`${Math.round(toNext * 100)}% to level ${level + 1}`}>
            <div className="game-stats-fill" style={{ width: `${Math.max(4, toNext * 100)}%` }} />
          </div>
          <p className="game-stats-note">
            {finished.length} {finished.length === 1 ? "quest" : "quests"} done ·{" "}
            {XP_PER_LEVEL - (xp % XP_PER_LEVEL)} {style.words.reward} to level {level + 1}
          </p>
        </section>
      )}

      {!first && done.length === 0 && quests.length === 0 && (
        <p className="empty">
          Nothing here yet. It fills in after your next lesson.
        </p>
      )}

      {first && <FocusGoal skill={first} />}

      {finished.length > 0 && (
        <section>
          <h2 className="t-eyebrow mb-3">Your quests</h2>
          <ul className="grid grid-cols-2 gap-3">
            {finished.map((lesson) => {
              const src = homeworkImageUrl(lesson, linkKey);
              const score = gameScore(lesson.homework);
              const games = lesson.homework?.exercises?.length ?? 0;
              return (
                <li key={lesson.id}>
                  <Link
                    href={questHref(lesson.id)}
                    className={`quest-tile card-press ${
                      src ? "" : `quest-tile-blank quest-tile-blank-${skinOf(style)}`
                    }`}
                    style={paletteVars(style) as React.CSSProperties}
                  >
                    {src ? (
                      // eslint-disable-next-line @next/next/no-img-element -- private upload
                      <img src={src} alt="" className="quest-tile-img" />
                    ) : (
                      // Homework with no picture is all games, so the tile says
                      // what is inside rather than leaving a blank card.
                      <span className={`quest-tile-face ${pixelFont.variable}`}>
                        <span className="quest-tile-games">
                          {games} {games === 1 ? "game" : "games"}
                        </span>
                      </span>
                    )}
                    <span
                      className={`quest-tile-badge quest-tile-badge-${skinOf(style)} ${pixelFont.variable}`}
                    >
                      {score.total > 0
                        ? `${score.right}/${score.total}`
                        : `+${XP_PER_QUEST} ${style.words.reward}`}
                    </span>
                    <span className="quest-tile-label">{lesson.title}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

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

      {done.length > 0 && (
        <section className="card card-pad">
          <p className="stat">{done.length}</p>
          <p className="t-subtitle mt-1">
            {done.length === 1
              ? "thing you couldn't do before"
              : "things you couldn't do before"}
          </p>
          <ul className="mt-4 flex flex-wrap gap-2">
            {done.map((skill) => (
              <li key={skill.topic} className="pill pill-done">
                {skill.topic}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
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
