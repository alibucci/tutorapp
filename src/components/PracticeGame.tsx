"use client";

import { useState } from "react";
import type { BuildRound, CatchRound, ChooseRound, Exercise } from "@/lib/types";

/**
 * The three practice games. Same three every week, so a child never has to
 * learn a game again - only the words inside change, and those come from the
 * lesson they just had.
 *
 * Each game reports how many it got right when it ends. Nothing here decides
 * what counts as right: that comes from the exercise the tutor approved.
 */

type Props = {
  exercise: Exercise;
  /** Called once, when the last round is answered. */
  onDone: (right: number) => void;
  /** Words from the theme, so a quest says "quest" and a story says "page". */
  words: { submit: string };
};

export function PracticeGame({ exercise, onDone, words }: Props) {
  switch (exercise.kind) {
    case "choose":
      return <Choose rounds={exercise.rounds} title={exercise.title} onDone={onDone} />;
    case "build":
      return (
        <Build rounds={exercise.rounds} title={exercise.title} onDone={onDone} words={words} />
      );
    case "catch":
      return (
        <Catch
          rounds={exercise.rounds}
          title={exercise.title}
          rule={exercise.rule}
          onDone={onDone}
        />
      );
  }
}

/** Shared bits: a round counter and the line shown after an answer. */
function Counter({ at, of }: { at: number; of: number }) {
  return (
    <p className="game-small game-step">
      {at + 1} / {of}
    </p>
  );
}

function Verdict({ right, why }: { right: boolean; why: string }) {
  return (
    <div className={`game-verdict ${right ? "game-verdict-yes" : "game-verdict-no"}`}>
      <p className="game-verdict-head">{right ? "Yes!" : "Not quite"}</p>
      <p className="game-verdict-why">{why}</p>
    </div>
  );
}

// --- 1. Pick the right word --------------------------------------------------

function Choose({
  rounds,
  title,
  onDone,
}: {
  rounds: ChooseRound[];
  title: string;
  onDone: (right: number) => void;
}) {
  const [at, setAt] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [right, setRight] = useState(0);
  const round = rounds[at];
  const answered = picked !== null;
  const correct = picked === round.answer;

  function pick(i: number) {
    if (answered) return;
    setPicked(i);
    if (i === round.answer) setRight((n) => n + 1);
  }

  function next() {
    if (at + 1 >= rounds.length) {
      onDone(right);
      return;
    }
    setAt(at + 1);
    setPicked(null);
  }

  // The gap is shown as the word once answered, so the child reads the whole
  // sentence the right way round before moving on.
  const [before, after] = round.sentence.split("___");
  return (
    <div className="game-panel" key={at}>
      <Counter at={at} of={rounds.length} />
      <p className="game-title mt-2">{title}</p>

      <p className="game-sentence mt-4">
        {before}
        <span className={`game-gap ${answered ? (correct ? "game-gap-yes" : "game-gap-no") : ""}`}>
          {answered ? round.options[round.answer] : "?"}
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
              answered && i === round.answer
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
          <Verdict right={correct} why={round.why} />
          <button onClick={next} className="game-button mt-4">
            {at + 1 >= rounds.length ? "Finish" : "Next"}
          </button>
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
  onDone,
  words,
}: {
  rounds: BuildRound[];
  title: string;
  onDone: (right: number) => void;
  words: { submit: string };
}) {
  const [at, setAt] = useState(0);
  const [placed, setPlaced] = useState<number[]>([]);
  const [checked, setChecked] = useState(false);
  const [right, setRight] = useState(0);
  const round = rounds[at];

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
    if (correct) setRight((n) => n + 1);
  }

  function next() {
    if (at + 1 >= rounds.length) {
      // `right` already counts this round: check() ran in an earlier render.
      onDone(right);
      return;
    }
    setAt(at + 1);
    setPlaced([]);
    setChecked(false);
  }

  return (
    <div className="game-panel" key={at}>
      <Counter at={at} of={rounds.length} />
      <p className="game-title mt-2">{title}</p>
      <p className="game-hint mt-2">Tap the words in the right order.</p>

      {/* The sentence being built. Tapping a word takes it back. */}
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

      {checked && !correct && (
        <p className="game-answer mt-3">{round.answer.join(" ")}</p>
      )}
      {checked && <Verdict right={correct} why={round.why} />}

      <button
        onClick={checked ? next : check}
        disabled={!checked && !full}
        className="game-button mt-4"
      >
        {checked ? (at + 1 >= rounds.length ? "Finish" : "Next") : words.submit}
      </button>
    </div>
  );
}

// --- 3. Keep the right words -------------------------------------------------

function Catch({
  rounds,
  title,
  rule,
  onDone,
}: {
  rounds: CatchRound[];
  title: string;
  rule: string;
  onDone: (right: number) => void;
}) {
  const [at, setAt] = useState(0);
  const [choice, setChoice] = useState<boolean | null>(null);
  const [right, setRight] = useState(0);
  const round = rounds[at];
  const answered = choice !== null;
  const correct = choice === round.keep;

  function answer(keep: boolean) {
    if (answered) return;
    setChoice(keep);
    if (keep === round.keep) setRight((n) => n + 1);
  }

  function next() {
    if (at + 1 >= rounds.length) {
      onDone(right);
      return;
    }
    setAt(at + 1);
    setChoice(null);
  }

  return (
    <div className="game-panel">
      <Counter at={at} of={rounds.length} />
      <p className="game-title mt-2">{title}</p>
      <p className="game-rule mt-2">{rule}</p>

      {/* The word drifts in on its own, which is the whole animation. */}
      <div className="game-lane mt-4">
        <span
          key={at}
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
            why={
              round.keep
                ? `"${round.word}" is one to keep.`
                : `"${round.word}" is not one to keep - send it away.`
            }
          />
          <button onClick={next} className="game-button mt-4">
            {at + 1 >= rounds.length ? "Finish" : "Next"}
          </button>
        </>
      )}
    </div>
  );
}
