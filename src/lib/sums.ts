import type { Exercise } from "./types";

/**
 * Arithmetic homework, made by code.
 *
 * When a tutor asks for sums - "adding and taking away up to 20", "the 3
 * times table" - the model only reads the request: which operations, how
 * big the numbers, which tables. Every sum, answer and wrong option is made
 * here, so each one is right by construction and the set is new every time.
 * A child marked wrong for a right answer stops trusting the game; this is
 * the one place that cannot happen.
 */

export type SumsPlan = {
  add: boolean;
  subtract: boolean;
  multiply: boolean;
  divide: boolean;
  /** The largest number anywhere, answers included. */
  upTo: number;
  /** For times and dividing: which tables. Empty means 2 to 10. */
  tables: number[];
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

function makeSum(op: Op, plan: SumsPlan): Sum | null {
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
function makeSums(plan: SumsPlan, count: number): Sum[] {
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

/** Near misses: one or two off, or ten off once numbers pass ten. */
function nearMisses(answer: number): number[] {
  const near = [answer - 1, answer + 1, answer - 2, answer + 2];
  if (answer > 10) near.push(answer - 10, answer + 10);
  return shuffle(near.filter((n) => n >= 0 && n !== answer));
}

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

export function sumsHomework(
  plan: SumsPlan,
  words: { topic: string; chooseTitle: string; catchTitle: string },
  short: boolean,
): Exercise[] {
  const cut = (s: string, n: number) => (s.trim().length <= n ? s.trim() : `${s.trim().slice(0, n - 1)}…`);
  const topic = cut(words.topic || "Sums", 60);

  const choose = makeSums(plan, short ? 3 : 6).map((sum) => {
    const options = shuffle([sum.answer, ...nearMisses(sum.answer).slice(0, 2)]);
    return {
      sentence: `${text(sum)} = ___`,
      options: options.map(String),
      answer: options.indexOf(sum.answer),
      why: why(sum),
    };
  });

  // Half right, half a near miss, so catching means checking every one.
  const catchRounds = makeSums(plan, short ? 6 : 10).map((sum, i) => {
    const right = i % 2 === 0;
    const shown = right ? sum.answer : nearMisses(sum.answer)[0];
    return { word: `${text(sum)} = ${shown}`, keep: right };
  });

  const out: Exercise[] = [];
  if (choose.length >= 3) {
    out.push({ kind: "choose", title: cut(words.chooseTitle || "Pick the answer", 50), topic, rounds: choose });
  }
  if (catchRounds.length >= 4) {
    out.push({
      kind: "catch",
      title: cut(words.catchTitle || "Catch the right sums", 50),
      topic,
      // Always this rule: it is what the game checks. A model's own wording
      // ("the ones that make 10") would set the child a different game.
      rule: "Catch the sums that are right",
      rounds: shuffle(catchRounds),
    });
  }
  return out;
}
