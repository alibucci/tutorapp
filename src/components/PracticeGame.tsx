"use client";

import { useState } from "react";
import type {
  BuildRound,
  CatchRound,
  ChooseRound,
  Exercise,
  RoundReply,
} from "@/lib/types";

/**
 * The three practice games. Same three every week, so a child never has to
 * learn a game again - only the words inside change, and those come from the
 * lesson they just had.
 *
 * A wrong answer is worth a second go: the child reads why, then puts it right
 * straight away, which is the only moment the explanation means anything. The
 * score still counts the FIRST answer, because that is the honest measure of
 * what they knew - the retry is for learning, not for the number.
 *
 * Nothing here decides what is right. The game sends what the child answered
 * and the server, which holds the exercise, works out the score.
 */

type Props = {
  exercise: Exercise;
  /** Fired once per round, on the first answer, so the counter can move. */
  onRound: (right: boolean) => void;
  /** Fired when the last round is answered, with the first answer to each. */
  onDone: (replies: RoundReply[]) => void;
  /** Words from the theme, so a quest says "quest" and a story says "page". */
  words: { submit: string };
};

export function PracticeGame({ exercise, onRound, onDone, words }: Props) {
  switch (exercise.kind) {
    case "choose":
      return (
        <Choose
          rounds={exercise.rounds}
          title={exercise.title}
          onRound={onRound}
          onDone={onDone}
        />
      );
    case "build":
      return (
        <Build
          rounds={exercise.rounds}
          title={exercise.title}
          onRound={onRound}
          onDone={onDone}
          words={words}
        />
      );
    case "catch":
      return (
        <Catch
          rounds={exercise.rounds}
          title={exercise.title}
          rule={exercise.rule}
          onRound={onRound}
          onDone={onDone}
        />
      );
  }
}

// --- shared ------------------------------------------------------------------

function Counter({ at, of }: { at: number; of: number }) {
  return (
    <p className="game-small game-step">
      {at + 1} / {of}
    </p>
  );
}

/**
 * What happened, in a child's terms. A second-go success is praised but not
 * scored, and says so plainly rather than quietly giving nothing.
 */
function Verdict({
  right,
  attempt,
  why,
}: {
  right: boolean;
  attempt: number;
  why: string;
}) {
  const head = right ? (attempt === 1 ? "Yes!" : "That's it.") : "Not quite";
  return (
    <div className={`game-verdict ${right ? "game-verdict-yes" : "game-verdict-no"}`}>
      <p className="game-verdict-head">{head}</p>
      <p className="game-verdict-why">{why}</p>
      {right && attempt > 1 && (
        <p className="game-verdict-why">Next time you&rsquo;ll get it first go.</p>
      )}
    </div>
  );
}

function Buttons({
  canRetry,
  onRetry,
  onNext,
  last,
}: {
  canRetry: boolean;
  onRetry: () => void;
  onNext: () => void;
  last: boolean;
}) {
  return (
    <div className="mt-4 flex gap-3">
      {canRetry && (
        <button onClick={onRetry} className="game-button game-button-no">
          Try again
        </button>
      )}
      <button onClick={onNext} className="game-button">
        {last ? "Finish" : "Next"}
      </button>
    </div>
  );
}

// --- 1. Pick the right word --------------------------------------------------

function Choose({
  rounds,
  title,
  onRound,
  onDone,
}: {
  rounds: ChooseRound[];
  title: string;
  onRound: (right: boolean) => void;
  onDone: (replies: RoundReply[]) => void;
}) {
  const [at, setAt] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [replies, setReplies] = useState<number[]>([]);

  const round = rounds[at];
  const answered = picked !== null;
  const correct = picked === round.answer;
  const last = at + 1 >= rounds.length;

  function pick(i: number) {
    if (answered) return;
    setPicked(i);
    const n = attempt + 1;
    setAttempt(n);
    // Only the first answer is the child's real answer.
    if (n === 1) {
      setReplies([...replies, i]);
      onRound(i === round.answer);
    }
  }

  function next() {
    if (last) {
      onDone(replies);
      return;
    }
    setAt(at + 1);
    setPicked(null);
    setAttempt(0);
  }

  const [before, after] = round.sentence.split("___");
  return (
    <div className="game-panel" key={at}>
      <Counter at={at} of={rounds.length} />
      <p className="game-title mt-2">{title}</p>

      <p className="game-sentence mt-4">
        {before}
        <span className={`game-gap ${answered ? (correct ? "game-gap-yes" : "game-gap-no") : ""}`}>
          {answered && correct ? round.options[round.answer] : "?"}
        </span>
        {after}
      </p>

      <div className="mt-4 grid gap-2">
        {round.options.map((option, i) => (
          <button
            key={i}
            type="button"
            onClick={() => pick(i)}
            disabled={answered}
            className={`game-option ${
              answered && correct && i === round.answer
                ? "game-option-yes"
                : answered && i === picked
                  ? "game-option-no"
                  : ""
            }`}
          >
            {option}
          </button>
        ))}
      </div>

      {answered && (
        <>
          <Verdict
            right={correct}
            attempt={attempt}
            why={
              correct || attempt > 1
                ? round.why
                : "Read it again and pick another one."
            }
          />
          <Buttons
            canRetry={!correct && attempt === 1}
            onRetry={() => setPicked(null)}
            onNext={next}
            last={last}
          />
        </>
      )}
    </div>
  );
}

// --- 2. Build the sentence ---------------------------------------------------

/**
 * Shuffled the same way on the server and in the browser, from the words
 * themselves: a random order would differ between the two and React would
 * throw the page away and redraw it.
 */
function shuffle<T>(items: T[], seed: string): T[] {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
    const j = h % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function Build({
  rounds,
  title,
  onRound,
  onDone,
  words,
}: {
  rounds: BuildRound[];
  title: string;
  onRound: (right: boolean) => void;
  onDone: (replies: RoundReply[]) => void;
  words: { submit: string };
}) {
  const [at, setAt] = useState(0);
  const [placed, setPlaced] = useState<number[]>([]);
  const [attempt, setAttempt] = useState(0);
  const [checked, setChecked] = useState(false);
  const [replies, setReplies] = useState<string[][]>([]);

  const round = rounds[at];
  const last = at + 1 >= rounds.length;

  // Index into the shuffled pile, so the same word twice stays two tiles.
  const pile = shuffle(
    round.answer.map((word, i) => ({ word, i })),
    round.answer.join(" "),
  );
  const built = placed.map((p) => pile[p].word);
  const full = placed.length === round.answer.length;
  const correct = built.join(" ") === round.answer.join(" ");

  function check() {
    setChecked(true);
    const n = attempt + 1;
    setAttempt(n);
    if (n === 1) {
      setReplies([...replies, built]);
      onRound(correct);
    }
  }

  function next() {
    if (last) {
      onDone(replies);
      return;
    }
    setAt(at + 1);
    setPlaced([]);
    setChecked(false);
    setAttempt(0);
  }

  return (
    <div className="game-panel" key={at}>
      <Counter at={at} of={rounds.length} />
      <p className="game-title mt-2">{title}</p>
      <p className="game-hint mt-2">Tap the words in the right order.</p>

      <div className={`game-line mt-4 ${checked ? (correct ? "game-line-yes" : "game-line-no") : ""}`}>
        {placed.length === 0 && <span className="game-line-empty">Tap a word below…</span>}
        {placed.map((p, slot) => (
          <button
            key={slot}
            type="button"
            onClick={() => !checked && setPlaced(placed.filter((_, s) => s !== slot))}
            disabled={checked}
            className="game-tile game-tile-placed"
          >
            {pile[p].word}
          </button>
        ))}
      </div>

      <div className="game-pile mt-3">
        {pile.map((tile, p) => (
          <button
            key={p}
            type="button"
            onClick={() => !checked && setPlaced([...placed, p])}
            disabled={checked || placed.includes(p)}
            className={`game-tile ${placed.includes(p) ? "game-tile-used" : ""}`}
          >
            {tile.word}
          </button>
        ))}
      </div>

      {/* The answer is only given away once the second go is spent. */}
      {checked && !correct && attempt > 1 && (
        <p className="game-answer mt-3">{round.answer.join(" ")}</p>
      )}

      {checked && (
        <Verdict
          right={correct}
          attempt={attempt}
          why={
            correct || attempt > 1
              ? round.why
              : "Nearly - try a different order."
          }
        />
      )}

      {checked ? (
        <Buttons
          canRetry={!correct && attempt === 1}
          onRetry={() => {
            setPlaced([]);
            setChecked(false);
          }}
          onNext={next}
          last={last}
        />
      ) : (
        <button onClick={check} disabled={!full} className="game-button mt-4">
          {words.submit}
        </button>
      )}
    </div>
  );
}

// --- 3. Keep the right words -------------------------------------------------

function Catch({
  rounds,
  title,
  rule,
  onRound,
  onDone,
}: {
  rounds: CatchRound[];
  title: string;
  rule: string;
  onRound: (right: boolean) => void;
  onDone: (replies: RoundReply[]) => void;
}) {
  const [at, setAt] = useState(0);
  const [choice, setChoice] = useState<boolean | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [replies, setReplies] = useState<boolean[]>([]);

  const round = rounds[at];
  const answered = choice !== null;
  const correct = choice === round.keep;
  const last = at + 1 >= rounds.length;

  function answer(keep: boolean) {
    if (answered) return;
    setChoice(keep);
    const n = attempt + 1;
    setAttempt(n);
    if (n === 1) {
      setReplies([...replies, keep]);
      onRound(keep === round.keep);
    }
  }

  function next() {
    if (last) {
      onDone(replies);
      return;
    }
    setAt(at + 1);
    setChoice(null);
    setAttempt(0);
  }

  return (
    <div className="game-panel">
      <Counter at={at} of={rounds.length} />
      <p className="game-title mt-2">{title}</p>
      <p className="game-rule mt-2">{rule}</p>

      <div className="game-lane mt-4">
        <span
          key={`${at}-${attempt}`}
          className={`game-float ${
            answered ? (choice ? "game-float-kept" : "game-float-gone") : ""
          }`}
        >
          {round.word}
        </span>
      </div>

      <div className="mt-4 flex gap-3">
        <button
          type="button"
          onClick={() => answer(false)}
          disabled={answered}
          className="game-button game-button-no"
        >
          Send away
        </button>
        <button
          type="button"
          onClick={() => answer(true)}
          disabled={answered}
          className="game-button"
        >
          Keep it
        </button>
      </div>

      {answered && (
        <>
          <Verdict
            right={correct}
            attempt={attempt}
            why={
              correct || attempt > 1
                ? round.keep
                  ? `"${round.word}" is one to keep.`
                  : `"${round.word}" is not one to keep.`
                : "Read the rule again and try the other button."
            }
          />
          <Buttons
            canRetry={!correct && attempt === 1}
            onRetry={() => setChoice(null)}
            onNext={next}
            last={last}
          />
        </>
      )}
    </div>
  );
}
