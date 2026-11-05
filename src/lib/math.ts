import type { MathGame, MathPractice } from "./types";

/**
 * Math practice: adding and taking away, in the child's theme.
 *
 * Nothing here comes from a language model, unlike the English games. A wrong
 * answer key or a picture with the wrong number of blocks would teach a child
 * who already struggles the wrong thing, and they would believe it. So the sums
 * are listed by code, level by level, and the server re-marks every answer.
 *
 * No server imports: the game draws its next sums in the browser too.
 */

export type MathOp = "+" | "-";

export type MathSum = { a: number; op: MathOp; b: number };

export type MathProblem = MathSum & {
  /** The right answer and its near misses, in number order. */
  options: number[];
};

/** What the child answered first. A second go is for learning, not the score. */
export type MathReply = MathSum & { answer: number };

export const MATH_LEVELS = [
  { level: 1, label: "Adding up to 5" },
  { level: 2, label: "Adding and taking away up to 10" },
  { level: 3, label: "Up to 20, not crossing 10" },
  { level: 4, label: "Up to 20, crossing 10" },
] as const;

export const TOP_LEVEL = MATH_LEVELS.length;

/** Short enough for a child who finds this hard to finish every time. */
export const SUMS_PER_GAME = 10;

/** History kept on the student record. More than anyone reads back. */
const GAMES_KEPT = 50;

export function isMathLevel(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 1 && (value as number) <= TOP_LEVEL;
}

export function answerOf({ a, op, b }: MathSum): number {
  return op === "+" ? a + b : a - b;
}

export function sumText({ a, op, b }: MathSum): string {
  return `${a} ${op} ${b}`;
}

/** 8 + 5 and 13 - 5: the sums that go through ten, the hardest step here. */
function crossesTen({ a, op, b }: MathSum): boolean {
  return op === "+" ? a < 10 && a + b > 10 : a > 10 && a - b < 10;
}

/** Every sum a level can ask, adding and taking away apart. */
function sumsAt(level: number): { adding: MathSum[]; takingAway: MathSum[] } {
  const adding: MathSum[] = [];
  const takingAway: MathSum[] = [];
  const add = (a: number, b: number) => adding.push({ a, op: "+", b });
  const take = (a: number, b: number) => takingAway.push({ a, op: "-", b });

  if (level === 1) {
    for (let a = 1; a <= 4; a++) for (let b = 1; a + b <= 5; b++) add(a, b);
  } else if (level === 2) {
    for (let a = 1; a <= 9; a++) for (let b = 1; a + b <= 10; b++) add(a, b);
    for (let a = 2; a <= 10; a++) for (let b = 1; b < a; b++) take(a, b);
  } else if (level === 3) {
    for (let a = 10; a <= 18; a++) for (let b = 1; a % 10 + b <= 9; b++) add(a, b);
    for (let a = 11; a <= 19; a++) for (let b = 1; b <= a % 10; b++) take(a, b);
  } else {
    for (let a = 2; a <= 9; a++) for (let b = 2; b <= 9; b++) if (a + b > 10) add(a, b);
    for (let a = 11; a <= 18; a++) for (let b = a % 10 + 1; b <= 9; b++) take(a, b);
  }
  return { adding, takingAway };
}

function shuffled<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** The answer among numbers close enough that guessing does not beat counting. */
function optionsFor(sum: MathSum, level: number): number[] {
  const answer = answerOf(sum);
  const near = [-3, -2, -1, 1, 2, 3]
    .map((d) => answer + d)
    .filter((n) => n >= 1 && n <= 20);
  // Three to pick from at the first level, where the counting is the whole job.
  const wrong = shuffled(near).slice(0, level === 1 ? 2 : 3);
  return [answer, ...wrong].sort((x, y) => x - y);
}

/** One game: half adding and half taking away, wherever a level has both. */
export function makeGame(level: number): MathProblem[] {
  const { adding, takingAway } = sumsAt(level);
  const a = shuffled(adding);
  const t = shuffled(takingAway);
  const picked: MathSum[] = [];
  while (picked.length < SUMS_PER_GAME && (a.length || t.length)) {
    const from = picked.length % 2 === 0 ? a.length ? a : t : t.length ? t : a;
    picked.push(from.pop()!);
  }
  return shuffled(picked).map((sum) => ({ ...sum, options: optionsFor(sum, level) }));
}

/**
 * Mark a finished game. The page says what was asked and answered; whether it
 * was right is worked out here. Null when these are not that level's sums.
 */
export function markGame(
  level: unknown,
  replies: unknown,
  at: string,
): MathGame | null {
  if (!isMathLevel(level) || !Array.isArray(replies)) return null;
  if (replies.length !== SUMS_PER_GAME) return null;
  const { adding, takingAway } = sumsAt(level);
  const allowed = new Set([...adding, ...takingAway].map(sumText));

  const wrong: string[] = [];
  for (const reply of replies as Partial<MathReply>[]) {
    const { a, op, b, answer } = reply ?? {};
    if (!Number.isInteger(a) || !Number.isInteger(b) || !Number.isInteger(answer)) return null;
    const sum = { a, op, b } as MathSum;
    if (!allowed.has(sumText(sum))) return null;
    if (answer !== answerOf(sum)) wrong.push(sumText(sum));
  }
  return { at, level, right: replies.length - wrong.length, total: replies.length, wrong };
}

/**
 * Up after nearly all right, down after half or more wrong. Moved between
 * games rather than during one, so a child is never handed a harder sum for
 * doing well in the middle of finishing something.
 */
export function nextLevel(level: number, right: number, total: number): number {
  const share = total ? right / total : 0;
  if (share >= 0.9) return Math.min(TOP_LEVEL, level + 1);
  if (share <= 0.5) return Math.max(1, level - 1);
  return level;
}

/** A game added to the record, and the level it leads to. */
export function withGame(math: MathPractice, game: MathGame): MathPractice {
  return {
    ...math,
    // Only the level it was played at can move it: the tutor may have set a
    // different one while this game was open.
    level: game.level === math.level ? nextLevel(game.level, game.right, game.total) : math.level,
    games: [...math.games, game].slice(-GAMES_KEPT),
  };
}

function skillOf(text: string): string {
  const [a, op, b] = text.split(" ");
  const sum = { a: Number(a), op: op as MathOp, b: Number(b) };
  if (crossesTen(sum)) return "going past 10";
  return op === "-" ? "taking away" : "adding";
}

const RECENT_GAMES = 3;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** What a parent or tutor wants to know: how often, and what is hard. */
export function mathSummary(math: MathPractice, now = Date.now()) {
  const recent = math.games.slice(-RECENT_GAMES).flatMap((g) => g.wrong);
  const counts = new Map<string, number>();
  for (const text of recent) counts.set(skillOf(text), (counts.get(skillOf(text)) ?? 0) + 1);
  const skill = [...counts].sort((x, y) => y[1] - x[1])[0]?.[0];
  return {
    label: MATH_LEVELS.find((l) => l.level === math.level)?.label ?? "",
    playedThisWeek: math.games.filter((g) => now - new Date(g.at).getTime() < WEEK_MS).length,
    hardest: skill
      ? { skill, example: [...recent].reverse().find((text) => skillOf(text) === skill)! }
      : null,
    latest: math.games.slice(-5).reverse(),
  };
}
