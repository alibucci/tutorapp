"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/api";
import { gameFonts } from "@/lib/fonts";
import { type GameStyle, paletteVars, skinOf, themeOf } from "@/lib/gameStyles";
import {
  answerOf,
  makeGame,
  nextLevel,
  type MathProblem,
  type MathReply,
} from "@/lib/math";

/**
 * Sums made of things the child can count, in the theme they chose.
 *
 * The picture is the point: a child who is stuck on 8 + 5 can count their way
 * out, so it is always on screen and a wrong answer brings up the count rather
 * than the answer. No timer. As in the English games the score is the first
 * answer; the second go is for learning.
 */
export function MathGame({
  style,
  level: startLevel,
  problems: firstProblems,
  backHref,
  linkKey,
  preview,
}: {
  style: GameStyle;
  level: number;
  problems: MathProblem[];
  backHref: string;
  linkKey?: string;
  /** The tutor looking at the child's screen. Nothing is recorded. */
  preview?: boolean;
}) {
  const [level, setLevel] = useState(startLevel);
  const [problems, setProblems] = useState(firstProblems);
  /** -1 = the opening screen, problems.length = finished. */
  const [at, setAt] = useState(-1);
  const [missed, setMissed] = useState<number[]>([]);
  const [solved, setSolved] = useState(false);
  const [replies, setReplies] = useState<MathReply[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const problem = at >= 0 && at < problems.length ? problems[at] : null;
  const finished = at >= problems.length;
  const right = replies.filter((r) => r.answer === answerOf(r)).length;
  const answered = replies.length;
  const next = nextLevel(level, right, problems.length);

  function pick(option: number) {
    if (!problem || solved || missed.includes(option)) return;
    if (missed.length === 0) {
      const { a, op, b } = problem;
      setReplies((all) => [...all, { a, op, b, answer: option }]);
    }
    if (option === answerOf(problem)) setSolved(true);
    else setMissed((all) => [...all, option]);
  }

  async function save() {
    // A tutor trying it must not write a game to the child's record.
    if (preview) return;
    setSaving(true);
    setSaveError(null);
    const result = await api("/api/math", {
      method: "POST",
      json: { key: linkKey, level, replies },
    });
    setSaving(false);
    if (!result.ok) setSaveError(result.error);
  }

  function goOn() {
    setMissed([]);
    setSolved(false);
    setAt(at + 1);
    if (at + 1 >= problems.length) void save();
  }

  function playAgain() {
    setLevel(next);
    setProblems(makeGame(next));
    setReplies([]);
    setMissed([]);
    setSolved(false);
    setSaveError(null);
    setAt(0);
  }

  return (
    <div
      className={`game game-${skinOf(style)} ${themeOf(style)} ${gameFonts}`}
      style={paletteVars(style) as React.CSSProperties}
    >
      <div className="game-inner">
        <div className="flex items-center justify-between">
          <Link href={backHref} className="game-small">
            ← Back
          </Link>
          <span className="game-small">{preview ? "Preview" : style.name}</span>
        </div>

        {preview && (
          <p className="game-tip">
            <span className="game-small">You are seeing this as the child does.</span>{" "}
            Nothing you answer here is saved.
          </p>
        )}

        {at < 0 && (
          <div className="game-panel">
            <p className="game-title">Math time!</p>
            <p className="game-text mt-3">
              {problems.length} sums. Level {level}.
            </p>
            <MathPicture
              problem={{ a: 2, op: "+", b: 1, options: [] }}
              items={style.mathItems}
              counting={false}
            />
            <button onClick={() => setAt(0)} className="game-button mt-5">
              {style.words.start}
            </button>
          </div>
        )}

        {problem && (
          <div className="game-panel">
            <p className="game-small game-step">
              {at + 1} / {problems.length}
            </p>
            <p className="math-sum">
              {problem.a} {problem.op} {problem.b} ={" "}
              {solved ? answerOf(problem) : "?"}
            </p>
            <MathPicture
              // New sum, new picture: nothing carries over from the last one.
              key={at}
              problem={problem}
              items={style.mathItems}
              counting={missed.length > 0 || solved}
            />
            <p className="game-hint mt-3 text-center">
              {problem.op === "+" ? "How many in all?" : "How many are left?"}
            </p>
            <div
              className="math-options mt-3"
              style={{ "--math-options": problem.options.length } as React.CSSProperties}
            >
              {problem.options.map((option) => {
                const isRight = solved && option === answerOf(problem);
                const isWrong = missed.includes(option);
                return (
                  <button
                    key={option}
                    onClick={() => pick(option)}
                    disabled={solved || isWrong}
                    className={`game-option ${isRight ? "game-option-yes" : ""} ${
                      isWrong ? "game-option-no" : ""
                    }`}
                  >
                    {option}
                  </button>
                );
              })}
            </div>
            {missed.length > 0 && !solved && (
              <div className="game-verdict game-verdict-no" role="status">
                <p className="game-verdict-head">Count them again</p>
              </div>
            )}
            {solved && (
              <>
                <div className="game-verdict game-verdict-yes" role="status">
                  <p className="game-verdict-head">{missed.length ? "That's it!" : "Yes!"}</p>
                </div>
                <button onClick={goOn} className="game-button mt-4">
                  {at + 1 >= problems.length ? "Finish" : "Next"}
                </button>
              </>
            )}
          </div>
        )}

        {finished && (
          <div className="game-toast" role="status">
            <span aria-hidden className="game-toast-icon" />
            <span>
              <span className="game-toast-title">{style.words.cheer}</span>
              <span className="game-toast-text">
                {right} of {problems.length} right first time
              </span>
            </span>
          </div>
        )}
        {finished && (
          <div className="game-panel">
            <p className="game-text">
              {next > level
                ? `Level up! Next time: level ${next}.`
                : next < level
                  ? "Next time: some easier ones."
                  : "Play again and beat your score!"}
            </p>
            {saveError && (
              <div className="mt-3">
                <p className="game-error">{saveError}</p>
                <button
                  onClick={() => void save()}
                  disabled={saving}
                  className="game-button game-button-no mt-2"
                >
                  {saving ? "…" : "Try saving again"}
                </button>
              </div>
            )}
            <div className="mt-4 flex gap-3">
              <Link href={backHref} className="game-button game-button-no block">
                Back
              </Link>
              <button onClick={playAgain} className="game-button">
                Play again
              </button>
            </div>
          </div>
        )}

        <div className="game-hud">
          <p className="game-level">
            {right} {style.words.reward}
          </p>
          <div className="game-xp" aria-label={`${answered} of ${problems.length} answered`}>
            <div
              className="game-xp-fill"
              style={{ width: `${(answered / problems.length) * 100}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * The sum as things to count. Small sums sit in two groups around the sign.
 * Past ten they fill rows of ten, one thing after another, so 8 + 5 shows two
 * of the second kind finishing the row and three starting the next: the way
 * through ten is on the screen. Taking away crosses out the last ones.
 */
function MathPicture({
  problem,
  items,
  counting,
}: {
  problem: MathProblem;
  items: [string, string];
  /** Number what is there to count, once the child has needed it. */
  counting: boolean;
}) {
  const { a, op, b } = problem;
  const adding = op === "+";
  const shown = adding ? a + b : a;

  const thing = (i: number) => {
    const gone = !adding && i >= a - b;
    return (
      <span
        key={i}
        className={`math-item ${gone ? "math-item-gone" : ""}`}
        style={{ backgroundImage: `url(${items[adding && i >= a ? 1 : 0]})` }}
      >
        {counting && !gone && <span className="math-count">{i + 1}</span>}
      </span>
    );
  };
  const things = (from: number, to: number) =>
    Array.from({ length: to - from }, (_, n) => thing(from + n));

  const described = adding
    ? `${a} and ${b}, to count together`
    : `${a}, with ${b} crossed out`;

  if (shown > 10) {
    const slots = Math.ceil(shown / 10) * 10;
    return (
      <div className="math-picture math-tens" role="img" aria-label={described}>
        {things(0, shown)}
        {Array.from({ length: slots - shown }, (_, n) => (
          <span key={`empty-${n}`} className="math-item math-item-empty" />
        ))}
      </div>
    );
  }
  return (
    <div
      className={`math-picture math-groups ${shown > 6 ? "math-groups-stacked" : ""}`}
      role="img"
      aria-label={described}
    >
      <span className="math-group">{things(0, a)}</span>
      {adding && (
        <>
          <span aria-hidden className="math-plus">+</span>
          <span className="math-group">{things(a, a + b)}</span>
        </>
      )}
    </div>
  );
}
