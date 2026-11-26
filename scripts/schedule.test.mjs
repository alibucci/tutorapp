/**
 * The learning schedule and its queue, on a fixed clock.
 * Run with `npm run test:schedule`.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { LATE_LIMIT_MS, decide, instantOf, latestSlot, localParts, logged, nextSlot } from "../src/lib/schedule.ts";

// Wednesday 25 Nov 2026, 17:30 in Shanghai (UTC+8) = 09:30 UTC.
const WED_1730 = Date.UTC(2026, 10, 25, 9, 30);
const base = {
  enabled: true,
  reviewDays: [3, 5], // Wednesday, Friday
  time: "17:00",
  timezone: "Asia/Shanghai",
  minutes: 10,
  maxPerWeek: 2,
  mode: "auto",
  updatedAt: "2026-11-01T00:00:00Z",
};
const review = (over = {}) => ({ id: "r", by: "schedule", createdAt: "2026-11-20T09:00:00Z", sent: true, done: true, setAside: false, ...over });

test("wall clock and instants agree, in and out of daylight saving", () => {
  assert.equal(new Date(instantOf(2026, 11, 25, 17, 0, "Asia/Shanghai")).toISOString(), "2026-11-25T09:00:00.000Z");
  assert.equal(new Date(instantOf(2026, 7, 1, 9, 0, "Europe/London")).toISOString(), "2026-07-01T08:00:00.000Z");
  assert.equal(new Date(instantOf(2026, 12, 1, 9, 0, "Europe/London")).toISOString(), "2026-12-01T09:00:00.000Z");
  assert.equal(localParts(WED_1730, "Asia/Shanghai").weekday, 3);
});

test("the latest slot that has come round, and the next one", () => {
  assert.equal(latestSlot(base, WED_1730).key, "2026-11-25");
  assert.equal(latestSlot(base, WED_1730 - 3_600_000).key, "2026-11-20"); // 16:30: Friday's
  assert.equal(nextSlot(base, WED_1730).key, "2026-11-27");
  assert.equal(nextSlot({ ...base, pausedAt: "x" }, WED_1730), null);
});

test("a due slot with nothing pending makes a review", () => {
  const d = decide(base, [review()], WED_1730);
  assert.equal(d.kind, "make");
  assert.equal(d.slot.key, "2026-11-25");
});

test("a slot is dealt with once", () => {
  assert.equal(decide({ ...base, lastSlot: "2026-11-25" }, [], WED_1730).kind, "wait");
});

test("paused, off or manual: the schedule makes nothing", () => {
  assert.equal(decide({ ...base, pausedAt: "2026-11-24T00:00:00Z" }, [], WED_1730).kind, "wait");
  assert.equal(decide({ ...base, enabled: false }, [], WED_1730).kind, "wait");
  assert.equal(decide({ ...base, mode: "manual" }, [], WED_1730).kind, "wait");
});

test("an unfinished review holds the next one back", () => {
  const d = decide(base, [review({ done: false })], WED_1730);
  assert.equal(d.kind, "defer");
  assert.match(d.reason, /not finished/);
});

test("a draft waiting for the tutor holds the next one back", () => {
  assert.equal(decide(base, [review({ sent: false, done: false, by: "tutor" })], WED_1730).kind, "defer");
});

test("a review the tutor set aside does not hold anything back", () => {
  assert.equal(decide(base, [review({ done: false, setAside: true })], WED_1730).kind, "make");
});

test("never more than the weekly limit", () => {
  const recent = [review({ id: "a", createdAt: "2026-11-23T09:00:00Z" }), review({ id: "b", createdAt: "2026-11-24T09:00:00Z" })];
  assert.equal(decide(base, recent, WED_1730).kind, "skip");
  assert.equal(decide({ ...base, maxPerWeek: 3 }, recent, WED_1730).kind, "make");
});

test("a slot found long after it came (app was off) is let go, not made late", () => {
  const late = Date.UTC(2026, 10, 25, 9, 0) + LATE_LIMIT_MS + 60_000;
  const d = decide({ ...base, reviewDays: [3] }, [], late);
  assert.equal(d.kind, "skip");
});

test("missed slots never pile up: only the latest counts", () => {
  // Off since the Friday before: Wednesday's slot is the one, Friday's is gone.
  const d = decide({ ...base, lastSlot: "2026-11-18" }, [], WED_1730);
  assert.equal(d.slot.key, "2026-11-25");
});

test("the log keeps the slot dealt with and stays short", () => {
  let s = base;
  for (let i = 0; i < 30; i++) s = logged(s, { slot: `2026-11-${String(i + 1).padStart(2, "0")}`, at: "x", outcome: "skipped", reason: "r" });
  assert.equal(s.log.length, 20);
  assert.equal(s.lastSlot, "2026-11-30");
});
