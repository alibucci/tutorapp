import { AsyncLocalStorage } from "node:async_hooks";
import { promises as fs } from "fs";
import path from "path";
import {
  costOf,
  type Meter,
  type UsageEntry,
  type UsageProvider,
  type UsagePurpose,
} from "./usageCost";

export {
  PURPOSE_LABELS,
  smartReviewCost,
  summariseUsage,
  type UsageEntry,
  type UsagePurpose,
  type UsageRow,
  type UsageSummary,
} from "./usageCost";

/**
 * A line in a log for every paid call: which model, how much of it, for what
 * and for whom - so the cost of a lesson, a child or a Smart Review is known
 * rather than guessed, and a subscription can be priced from it later.
 *
 * Who and what come from where the work starts, not from the call: a route or
 * a background job wraps its work in withUsage(), and every model, picture,
 * speech or pronunciation call made inside it is put down against that. The
 * provider modules (llm.ts, imageGen.ts, speech.ts, pronounce.ts) only say
 * what they used.
 *
 * One file a month, one JSON line per call, appended: no lock needed, and a
 * crash costs at most the line being written. Recording never breaks the work
 * it records - a full disk loses a log line, not a child's homework.
 */

const USAGE_DIR = path.join(process.cwd(), "data", "usage");

export type UsageContext = {
  purpose: UsagePurpose;
  studentId?: string;
  tutorId?: string;
  lessonId?: string;
};

/**
 * On globalThis because Next bundles a module once per route: a job started
 * by one route and joined by another must still see one context store.
 */
const contexts: AsyncLocalStorage<Partial<UsageContext>> = ((
  globalThis as { __aloudliUsage?: AsyncLocalStorage<Partial<UsageContext>> }
).__aloudliUsage ??= new AsyncLocalStorage());

/**
 * Run `fn` with calls inside it put down against `ctx`. Nested, the inner
 * fields win and the rest are kept: a parent message written inside a
 * lesson's summary is still that lesson's.
 */
export function withUsage<T>(ctx: Partial<UsageContext>, fn: () => Promise<T>): Promise<T> {
  const set = Object.fromEntries(Object.entries(ctx).filter(([, v]) => v !== undefined));
  return contexts.run({ ...contexts.getStore(), ...set }, fn);
}

function currentUsage(): Partial<UsageContext> {
  return contexts.getStore() ?? {};
}

/** What a provider module knows about one call. */
export type UsageCall = {
  provider: UsageProvider;
  model: string;
  meter: Meter;
  inputTokens?: number;
  outputTokens?: number;
  units?: number;
  ok: boolean;
  /** Used when nothing around the call said what it was for. */
  purpose?: UsagePurpose;
};

const MONTH = /^\d{4}-\d{2}$/;

/** "2026-11", in UTC like every other date the server keeps. */
export function monthOf(at: string | Date = new Date()): string {
  return new Date(at).toISOString().slice(0, 7);
}

/** Put one call down. Never throws and never waits on the caller. */
export function recordUsage(call: UsageCall): void {
  try {
    const ctx = currentUsage();
    const at = new Date().toISOString();
    const entry: UsageEntry = {
      at,
      purpose: ctx.purpose ?? call.purpose ?? "other",
      provider: call.provider,
      model: call.model,
      ...(call.inputTokens !== undefined && { inputTokens: call.inputTokens }),
      ...(call.outputTokens !== undefined && { outputTokens: call.outputTokens }),
      ...(call.units !== undefined && { units: call.units }),
      // A hundred-millionth of a dollar is plenty, and keeps the lines short.
      costUsd: Math.round(costOf(call) * 1e8) / 1e8,
      ok: call.ok,
      ...(ctx.studentId && { studentId: ctx.studentId }),
      ...(ctx.tutorId && { tutorId: ctx.tutorId }),
      ...(ctx.lessonId && { lessonId: ctx.lessonId }),
    };
    const file = path.join(USAGE_DIR, `${monthOf(at)}.jsonl`);
    fs.mkdir(USAGE_DIR, { recursive: true })
      .then(() => fs.appendFile(file, `${JSON.stringify(entry)}\n`))
      .catch((e) => console.error("[usage] could not record:", e));
  } catch (e) {
    console.error("[usage] could not record:", e);
  }
}

/** Every call in a month. A line that will not parse is skipped, not fatal. */
export async function readUsage(month: string): Promise<UsageEntry[]> {
  if (!MONTH.test(month)) return [];
  let text: string;
  try {
    text = await fs.readFile(path.join(USAGE_DIR, `${month}.jsonl`), "utf8");
  } catch {
    return []; // nothing paid for that month
  }
  const entries: UsageEntry[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      entries.push(JSON.parse(line) as UsageEntry);
    } catch {
      // Half a line from a crash mid-append.
    }
  }
  return entries;
}
