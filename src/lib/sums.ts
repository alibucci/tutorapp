import type { BuildRound, ChooseRound, Exercise, WordsRound } from "./types";

/**
 * Number homework, made by code.
 *
 * When a tutor asks for sums or counting - "adding and taking away up to 20",
 * "the 3 times table", "counting to 50" - the model only reads the request:
 * which operations, how big the numbers, which tables, how far to count. Every
 * question, answer and wrong option is made here, so each one is right by
 * construction and the set is new every time. A child marked wrong for a
 * right answer stops trusting the game; this is the one place that cannot
 * happen.
 *
 * The child works things out in every game - picks the answer, finds the
 * missing number, puts numbers in order - rather than only judging sums
 * someone else wrote. Spotting the wrong sum is the third game at most.
 */

export type NumbersPlan = {
  add: boolean;
  subtract: boolean;
  multiply: boolean;
  divide: boolean;
  /** The largest number in a sum, answers included. */
  upTo: number;
  /** For times and dividing: which tables. Empty means 2 to 10. */
  tables: number[];
  /** Counting: what comes next, before, and numbers in order. */
  counting: boolean;
  countTo: number;
  /** Counting in ones, or twos, fives, tens. Empty means ones. */
  countBy: number[];
};

export type NumbersWords = {
  topic: string;
  chooseTitle: string;
  buildTitle: string;
  catchTitle: string;
};

type Op = "+" | "-" | "×" | "÷";
type Sum = { a: number; op: Op; b: number; answer: number };

const rand = (min: number, max: number) => min + Math.floor(Math.random() * (max - min + 1));
const pick = <T,>(items: T[]) => items[Math.floor(Math.random() * items.length)];

function shuffle<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export const hasSums = (p: NumbersPlan) => p.add || p.subtract || p.multiply || p.divide;

// --- sums -----------------------------------------------------------------

function makeSum(op: Op, plan: NumbersPlan): Sum | null {
  const top = Math.max(5, Math.min(plan.upTo, 1000));
  const tables = plan.tables.length ? plan.tables : [2, 3, 4, 5, 6, 7, 8, 9, 10];
  switch (op) {
    case "+": {
      const answer = rand(2, top);
      const a = rand(1, answer - 1);
      return { a, op, b: answer - a, answer };
    }
    case "-": {
      const a = rand(2, top);
      const b = rand(1, a - 1);
      return { a, op, b, answer: a - b };
    }
    case "×": {
      const a = pick(tables);
      const most = Math.min(10, Math.floor(top / a));
      if (most < 1) return null;
      // Times one is not practice; from two, unless nothing else fits.
      const b = rand(Math.min(2, most), most);
      return { a, op, b, answer: a * b };
    }
    case "÷": {
      const by = pick(tables);
      const most = Math.min(10, Math.floor(top / by));
      if (most < 1) return null;
      const answer = rand(Math.min(2, most), most);
      return { a: by * answer, op, b: by, answer };
    }
  }
}

/** `count` different sums, the operations taking turns. */
function makeSums(plan: NumbersPlan, count: number): Sum[] {
  const ops: Op[] = [
    ...(plan.add ? (["+"] as const) : []),
    ...(plan.subtract ? (["-"] as const) : []),
    ...(plan.multiply ? (["×"] as const) : []),
    ...(plan.divide ? (["÷"] as const) : []),
  ];
  if (!ops.length) return [];
  const seen = new Set<string>();
  const out: Sum[] = [];
  for (let tries = 0; out.length < count && tries < count * 50; tries++) {
    const sum = makeSum(ops[out.length % ops.length], plan);
    if (!sum) continue;
    const key = text(sum);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(sum);
  }
  return shuffle(out);
}

// A plain hyphen: the game fonts draw the true minus sign too high.
const text = ({ a, op, b }: Sum) => `${a} ${op} ${b}`;

/**
 * Near misses: one or two off, or ten off once numbers pass ten - and never
 * past the limit the tutor gave. "Up to 20" means no 26 anywhere on the
 * screen, wrong options included.
 */
function nearMisses(answer: number, step: number, max: number): number[] {
  const fits = (n: number) => n >= 0 && n <= max && n !== answer;
  const near = [answer - step, answer + step, answer - 2 * step, answer + 2 * step];
  if (step === 1 && answer > 10) near.push(answer - 10, answer + 10);
  if (step !== 1) near.push(answer - 1, answer + 1);
  const close = shuffle([...new Set(near)].filter(fits));
  if (close.length >= 2) return close;
  // Squeezed against 0 or the limit: anything else in range will do.
  const rest = shuffle(Array.from({ length: max + 1 }, (_, n) => n).filter((n) => fits(n) && !close.includes(n)));
  return [...close, ...rest];
}

/** Three options, the right one somewhere among them, all within `max`. */
function options(answer: number, max: number, step = 1) {
  const all = shuffle([answer, ...nearMisses(answer, step, max).slice(0, 2)]);
  return { options: all.map(String), answer: all.indexOf(answer) };
}

const sumLimit = (plan: NumbersPlan) => Math.max(5, Math.min(plan.upTo, 1000));
const countLimit = (plan: NumbersPlan) => Math.max(10, Math.min(plan.countTo, 1000));

/** The answer, with the step over ten spelled out where there is one. */
function why(sum: Sum): string {
  const { a, op, b, answer } = sum;
  if (op === "+" && a < 10 && b < 10 && answer > 10) {
    const toTen = 10 - a;
    return `${a} + ${toTen} = 10, and ${b - toTen} more is ${answer}.`;
  }
  if (op === "-" && a > 10 && a < 20 && b < 10 && answer < 10) {
    const toTen = a - 10;
    return `${a} - ${toTen} = 10, then take away ${b - toTen} more: ${answer}.`;
  }
  return `${text(sum)} = ${answer}.`;
}

function sumRounds(plan: NumbersPlan, n: number): ChooseRound[] {
  return makeSums(plan, n).map((sum) => ({
    sentence: `${text(sum)} = ___`,
    ...options(sum.answer, sumLimit(plan)),
    why: why(sum),
  }));
}

/** "___ + 4 = 11": the same kind of sums, worked backwards. */
function missingRounds(plan: NumbersPlan, n: number): WordsRound[] {
  return makeSums(plan, n).map((sum, i) => {
    const first = i % 2 === 0;
    const gap = first ? sum.a : sum.b;
    const meaning = first
      ? `___ ${sum.op} ${sum.b} = ${sum.answer}`
      : `${sum.a} ${sum.op} ___ = ${sum.answer}`;
    return { meaning, ...options(gap, sumLimit(plan)), why: `${text(sum)} = ${sum.answer}.` };
  });
}

/** Half right, half a near miss, so catching means checking every one. */
function catchRounds(plan: NumbersPlan, n: number) {
  return shuffle(
    makeSums(plan, n).map((sum, i) => {
      const right = i % 2 === 0;
      const shown = right ? sum.answer : nearMisses(sum.answer, 1, sumLimit(plan))[0];
      return { word: `${text(sum)} = ${shown}`, keep: right };
    }),
  );
}

// --- counting --------------------------------------------------------------

function countSteps(plan: NumbersPlan): number[] {
  const steps = plan.countBy.filter((s) => s >= 1 && s <= 100);
  return steps.length ? steps : [1];
}

/** A start that often crosses a ten, where counting goes wrong: 28, 29, 30. */
function countStart(step: number, length: number, top: number): number {
  const last = top - step * (length - 1);
  if (last < 0) return 0;
  if (step === 1 && top >= 20 && Math.random() < 0.6) {
    const ten = 10 * rand(1, Math.floor(top / 10));
    const start = ten - rand(1, length - 1);
    if (start >= 0 && start <= last) return start;
  }
  return Math.min(Math.floor(rand(0, last) / step) * step, last);
}

/** What comes next, just before, just after. */
function nextRounds(plan: NumbersPlan, n: number): WordsRound[] {
  const top = Math.max(10, Math.min(plan.countTo, 1000));
  const out: WordsRound[] = [];
  const seen = new Set<string>();
  for (let tries = 0; out.length < n && tries < n * 40; tries++) {
    const step = pick(countSteps(plan));
    const kind = out.length % 3;
    let round: WordsRound;
    if (kind === 0) {
      const start = countStart(step, 4, top);
      const seq = [0, 1, 2, 3].map((k) => start + k * step);
      round = {
        meaning: `What comes next? ${seq.slice(0, 3).join(", ")}, ___`,
        ...options(seq[3], countLimit(plan), step),
        why: `Count on${step > 1 ? ` in ${step}s` : ""}: ${seq.join(", ")}.`,
      };
    } else {
      // In the steps being practised: counting in 5s, before 25 is 20.
      const most = Math.floor(top / step);
      if (most < 2) continue;
      const before = kind === 1;
      const x = step * (before ? rand(1, most) : rand(0, most - 1));
      const answer = before ? x - step : x + step;
      const inSteps = step > 1 ? `Counting in ${step}s, what` : "What number";
      round = {
        meaning: `${inSteps} comes just ${before ? "before" : "after"} ${x}?`,
        ...options(answer, countLimit(plan), step),
        why: `${before ? "Count back" : "Count on"}${step > 1 ? ` ${step}` : " one"}: ${x}, ${answer}.`,
      };
    }
    if (seen.has(round.meaning)) continue;
    seen.add(round.meaning);
    out.push(round);
  }
  return out;
}

/** Numbers to put back in counting order. */
function orderRounds(plan: NumbersPlan, n: number): BuildRound[] {
  const top = Math.max(10, Math.min(plan.countTo, 1000));
  const out: BuildRound[] = [];
  const seen = new Set<string>();
  for (let tries = 0; out.length < n && tries < n * 40; tries++) {
    const step = pick(countSteps(plan));
    const start = countStart(step, 5, top);
    const seq = Array.from({ length: 5 }, (_, k) => String(start + k * step));
    if (seen.has(seq[0] + "/" + step)) continue;
    seen.add(seq[0] + "/" + step);
    out.push({ answer: seq, why: `Count up${step > 1 ? ` in ${step}s` : ""}: ${seq.join(", ")}.` });
  }
  return out;
}

/** "21, 22, ___, 24, 25": the gap in a counting line. */
function gapRounds(plan: NumbersPlan, n: number): ChooseRound[] {
  const top = Math.max(10, Math.min(plan.countTo, 1000));
  const out: ChooseRound[] = [];
  const seen = new Set<string>();
  for (let tries = 0; out.length < n && tries < n * 40; tries++) {
    const step = pick(countSteps(plan));
    const start = countStart(step, 5, top);
    const seq = [0, 1, 2, 3, 4].map((k) => start + k * step);
    const gap = rand(1, 3);
    const sentence = seq.map((v, k) => (k === gap ? "___" : String(v))).join(", ");
    if (seen.has(sentence)) continue;
    seen.add(sentence);
    out.push({ sentence, ...options(seq[gap], countLimit(plan), step), why: `${seq.join(", ")}.` });
  }
  return out;
}

// --- the homework ------------------------------------------------------------

export function numbersHomework(plan: NumbersPlan, words: NumbersWords, short: boolean): Exercise[] {
  const cut = (s: string, n: number) => (s.trim().length <= n ? s.trim() : `${s.trim().slice(0, n - 1)}…`);
  const topic = cut(words.topic || "Numbers", 60);
  const title = (t: string, fallback: string) => cut(t || fallback, 50);
  const sums = hasSums(plan);
  const counting = plan.counting;
  const out: Exercise[] = [];

  // Working answers out comes first; judging someone else's sums comes last.
  if (sums) {
    const rounds = sumRounds(plan, short ? 4 : 6);
    if (rounds.length >= 3) out.push({ kind: "choose", title: title(words.chooseTitle, "Work it out"), topic, rounds });
  } else if (counting) {
    const rounds = gapRounds(plan, short ? 4 : 6);
    if (rounds.length >= 3) out.push({ kind: "choose", title: title(words.chooseTitle, "Fill the gap"), topic, rounds });
  }

  if (counting) {
    const rounds = orderRounds(plan, short ? 2 : 4);
    if (rounds.length >= 2) out.push({ kind: "build", title: title(words.buildTitle, "Put them in order"), topic, rounds });
  }

  const wordRounds = counting ? nextRounds(plan, short ? 4 : 6) : sums ? missingRounds(plan, short ? 4 : 6) : [];
  if (wordRounds.length >= 3) {
    out.push({
      kind: "words",
      // A fixed name: the model's title for this one tends to describe the
      // other game.
      title: counting ? "What comes next?" : "Find the missing number",
      topic,
      rounds: wordRounds,
    });
  }

  if (sums && !counting) {
    const rounds = catchRounds(plan, short ? 6 : 10);
    if (rounds.length >= 4) {
      out.push({
        kind: "catch",
        // Fixed, like the rule: a model's title ("sums that make 10") can
        // promise a different game from the one it is.
        title: "Catch the right sums",
        topic,
        // Always this rule: it is what the game checks. A model's own
        // wording ("the ones that make 10") would set a different game.
        rule: "Catch the sums that are right",
        rounds,
      });
    }
  }

  return out.slice(0, short ? 2 : 3);
}
