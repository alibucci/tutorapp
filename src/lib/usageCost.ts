/**
 * What a generation costs, worked out from what was used. Pure: no files, no
 * imports, so the arithmetic can be tested on its own (scripts/usage.test.mjs).
 * The recording itself lives in usage.ts.
 *
 * Every figure here is an ESTIMATE. The prices below are placeholders, written
 * down so the sums are never blank - check each one against the provider's
 * current price page (DeepSeek, Alibaba Model Studio, Deepgram, SpeechSuper)
 * and set the env overrides on the server rather than trusting these.
 */

/**
 * Why a call was made: the rows the cost is reported by. A call made outside
 * any withUsage() is "other" (pictures, speech and scores excepted).
 *
 * TODO: "smart_review" and "weekly_brief" are not set anywhere yet - Smart
 * Review should wrap its work in withUsage({ purpose: "smart_review",
 * lessonId, ... }) so its average per lesson shows on the Usage page. Also
 * still "other": programme items built by themselves (programmes.ts), one
 * slide remade (plans.remakeSlide) and learner themes (themeGen.ts).
 */
export type UsagePurpose =
  | "lesson_summary"
  | "lesson_homework"
  | "extra_homework"
  | "smart_review"
  | "regeneration"
  | "lesson_plan"
  | "parent_message"
  | "parent_report"
  | "skills"
  | "weekly_brief"
  | "image"
  | "speech"
  | "pronunciation"
  | "other";

export const PURPOSE_LABELS: Record<UsagePurpose, string> = {
  lesson_summary: "Lesson summary",
  lesson_homework: "Lesson homework",
  extra_homework: "Extra homework",
  smart_review: "Smart Review",
  regeneration: "Built again by the tutor",
  lesson_plan: "Lesson plans",
  parent_message: "Parent message",
  parent_report: "Parent report",
  skills: "Skills",
  weekly_brief: "Weekly brief",
  image: "Pictures",
  speech: "Speech to text",
  pronunciation: "Pronunciation checks",
  other: "Other",
};

export type UsageProvider = "deepseek" | "dashscope" | "deepgram" | "speechsuper";

/** What a call is paid by. */
export type Meter = "tokens" | "images" | "audio_seconds" | "calls";

/** One paid call, as kept in data/usage/<YYYY-MM>.jsonl. */
export type UsageEntry = {
  at: string;
  purpose: UsagePurpose;
  provider: UsageProvider;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  /** Images, seconds of audio or scores - whatever the meter counts. */
  units?: number;
  costUsd: number;
  /** False when the call failed, or its answer was thrown away. */
  ok: boolean;
  studentId?: string;
  tutorId?: string;
  lessonId?: string;
};

type Env = Record<string, string | undefined>;

/**
 * USD per million tokens. PLACEHOLDERS - check https://api-docs.deepseek.com
 * pricing. Cache hits are charged less than this; every input token is priced
 * as a miss, so the estimate leans high, which is the safe side for pricing.
 */
const TOKEN_PRICES: Record<string, { in: number; out: number }> = {
  "deepseek-v4-pro": { in: 0.55, out: 2.2 },
  "deepseek-flash": { in: 0.14, out: 0.28 },
  "deepseek-chat": { in: 0.28, out: 0.42 },
  "deepseek-reasoner": { in: 0.28, out: 0.42 },
};
/** A model not in the table is priced as the careful one: better high than nothing. */
const TOKEN_FALLBACK = TOKEN_PRICES["deepseek-v4-pro"];

/** USD per image drawn. PLACEHOLDER - check Model Studio's Wan pricing. */
const IMAGE_PRICE = 0.03;
/** USD per minute of audio. PLACEHOLDERS - check Deepgram and Model Studio pricing. */
const ASR_PER_MIN: Record<string, number> = {
  "nova-3": 0.0043,
  "qwen3-asr-flash": 0.0021,
};
const ASR_FALLBACK = 0.0043;
/** USD per pronunciation score. PLACEHOLDER - SpeechSuper prices by plan. */
const PRONOUNCE_PRICE = 0.002;

/** "deepseek-v4-pro" -> "DEEPSEEK_V4_PRO", for its env override names. */
export function envSlug(model: string): string {
  return model.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "");
}

/** A price from the env when it is set and a number; the default otherwise. */
function priced(env: Env, name: string, fallback: number): number {
  const raw = env[name];
  const n = raw === undefined || raw.trim() === "" ? NaN : Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/** Per-million-token prices for a model, env first (PRICE_<MODEL>_IN / _OUT). */
export function tokenPrice(model: string, env: Env = process.env): { in: number; out: number } {
  const base = TOKEN_PRICES[model] ?? TOKEN_FALLBACK;
  const slug = envSlug(model);
  return {
    in: priced(env, `PRICE_${slug}_IN`, base.in),
    out: priced(env, `PRICE_${slug}_OUT`, base.out),
  };
}

/** What one call cost, in USD, by what its meter counted. */
export function costOf(
  call: { meter: Meter; model: string; inputTokens?: number; outputTokens?: number; units?: number },
  env: Env = process.env,
): number {
  const units = call.units ?? 0;
  switch (call.meter) {
    case "tokens": {
      const price = tokenPrice(call.model, env);
      return ((call.inputTokens ?? 0) * price.in + (call.outputTokens ?? 0) * price.out) / 1_000_000;
    }
    case "images":
      return units * priced(env, "PRICE_IMAGE", IMAGE_PRICE);
    case "audio_seconds":
      return (units / 60) * priced(env, "PRICE_ASR_PER_MIN", ASR_PER_MIN[call.model] ?? ASR_FALLBACK);
    case "calls":
      return units * priced(env, "PRICE_PRONOUNCE", PRONOUNCE_PRICE);
  }
}

// ---------------------------------------------------------------- summing up

export type UsageRow = {
  key: string;
  calls: number;
  failed: number;
  inputTokens: number;
  outputTokens: number;
  units: number;
  costUsd: number;
  /** What the failed calls cost: paid for, used for nothing. */
  failedUsd: number;
};

export type UsageSummary = {
  total: UsageRow;
  byPurpose: UsageRow[];
  byModel: UsageRow[];
  /** Only calls made for a known student. */
  byStudent: UsageRow[];
  /** Per student per month ("2026-11:<studentId>"), for entries spanning months. */
  byStudentMonth: (UsageRow & { month: string; studentId: string })[];
};

const emptyRow = (key: string): UsageRow => ({
  key,
  calls: 0,
  failed: 0,
  inputTokens: 0,
  outputTokens: 0,
  units: 0,
  costUsd: 0,
  failedUsd: 0,
});

function add(row: UsageRow, e: UsageEntry): void {
  row.calls += 1;
  row.inputTokens += e.inputTokens ?? 0;
  row.outputTokens += e.outputTokens ?? 0;
  row.units += e.units ?? 0;
  row.costUsd += e.costUsd;
  if (!e.ok) {
    row.failed += 1;
    row.failedUsd += e.costUsd;
  }
}

/** Rows by some key, dearest first. Entries without a key are left out. */
function groupBy(entries: UsageEntry[], keyOf: (e: UsageEntry) => string | undefined): UsageRow[] {
  const rows = new Map<string, UsageRow>();
  for (const e of entries) {
    const key = keyOf(e);
    if (!key) continue;
    let row = rows.get(key);
    if (!row) rows.set(key, (row = emptyRow(key)));
    add(row, e);
  }
  return [...rows.values()].sort((a, b) => b.costUsd - a.costUsd || b.calls - a.calls);
}

export function summariseUsage(entries: UsageEntry[]): UsageSummary {
  const total = emptyRow("total");
  for (const e of entries) add(total, e);
  return {
    total,
    byPurpose: groupBy(entries, (e) => e.purpose),
    byModel: groupBy(entries, (e) => `${e.provider}/${e.model}`),
    byStudent: groupBy(entries, (e) => e.studentId),
    byStudentMonth: groupBy(entries, (e) => (e.studentId ? `${e.at.slice(0, 7)}:${e.studentId}` : undefined)).map(
      (row) => {
        const [month, studentId] = [row.key.slice(0, 7), row.key.slice(8)];
        return { ...row, month, studentId };
      },
    ),
  };
}

/**
 * What one Smart Review costs on average: every smart_review call for a
 * lesson added up, failed attempts included (they are paid for), over the
 * lessons that got at least one answer through. Null when there are none.
 */
export function smartReviewCost(
  entries: UsageEntry[],
): { lessons: number; totalUsd: number; averageUsd: number } | null {
  const lessons = new Map<string, { cost: number; finished: boolean }>();
  for (const e of entries) {
    if (e.purpose !== "smart_review" || !e.lessonId) continue;
    const lesson = lessons.get(e.lessonId) ?? { cost: 0, finished: false };
    lesson.cost += e.costUsd;
    lesson.finished ||= e.ok;
    lessons.set(e.lessonId, lesson);
  }
  const finished = [...lessons.values()].filter((l) => l.finished);
  if (!finished.length) return null;
  const totalUsd = finished.reduce((sum, l) => sum + l.cost, 0);
  return { lessons: finished.length, totalUsd, averageUsd: totalUsd / finished.length };
}
