import assert from "node:assert/strict";
import test from "node:test";
import { computeWorkloadStrain } from "../src/lib/workload-strain";
import type { BrowserActivityDay, WorkloadItem } from "../src/lib/types";

const NOW = new Date("2026-06-13T12:00:00.000Z").getTime();

function item(overrides: Partial<WorkloadItem> = {}): WorkloadItem {
  return {
    id: Math.random().toString(36).slice(2),
    title: "Assignment",
    source: "Manual",
    dueAt: new Date(NOW + 72 * 3_600_000).toISOString(),
    status: "upcoming",
    gradeImpact: "medium",
    ...overrides,
  };
}

function activityDay(overrides: Partial<BrowserActivityDay> = {}): BrowserActivityDay {
  return {
    localDate: "2026-06-13",
    activeMinutes: 0,
    educationMinutes: 0,
    productivityMinutes: 0,
    socialMinutes: 0,
    entertainmentMinutes: 0,
    otherMinutes: 0,
    lateNightMinutes: 0,
    longestSessionMinutes: 0,
    tabSwitches: 0,
    breakCount: 0,
    ...overrides,
  };
}

test("no work means a light, zero score", () => {
  const strain = computeWorkloadStrain([], undefined, NOW);
  assert.equal(strain.score, 0);
  assert.equal(strain.level, "light");
});

test("closer and higher-impact deadlines raise the score", () => {
  const far = computeWorkloadStrain(
    [item({ dueAt: new Date(NOW + 6 * 24 * 3_600_000).toISOString(), gradeImpact: "low" })],
    undefined,
    NOW,
  );
  const near = computeWorkloadStrain(
    [item({ dueAt: new Date(NOW + 12 * 3_600_000).toISOString(), gradeImpact: "high" })],
    undefined,
    NOW,
  );
  assert.ok(near.score > far.score);
});

test("more concurrent deadlines push toward heavy", () => {
  const many = Array.from({ length: 6 }, () =>
    item({ dueAt: new Date(NOW + 20 * 3_600_000).toISOString(), gradeImpact: "high" }),
  );
  const strain = computeWorkloadStrain(many, undefined, NOW);
  assert.equal(strain.level, "heavy");
});

test("overdue items are reported as drivers", () => {
  const strain = computeWorkloadStrain(
    [item({ status: "overdue", dueAt: new Date(NOW - 24 * 3_600_000).toISOString() })],
    undefined,
    NOW,
  );
  assert.ok(strain.drivers.some((d) => /overdue/i.test(d)));
});

test("submitted work does not add strain", () => {
  const strain = computeWorkloadStrain(
    [item({ status: "submitted", gradeImpact: "high", dueAt: new Date(NOW + 6 * 3_600_000).toISOString() })],
    undefined,
    NOW,
  );
  assert.equal(strain.score, 0);
});

test("activity signals add to strain and name themselves", () => {
  const base = computeWorkloadStrain([item()], undefined, NOW);
  const withActivity = computeWorkloadStrain(
    [item()],
    activityDay({ lateNightMinutes: 90, longestSessionMinutes: 150, activeMinutes: 200, breakCount: 0 }),
    NOW,
  );
  assert.ok(withActivity.score > base.score);
  assert.ok(withActivity.drivers.some((d) => /late-night/i.test(d)));
  assert.ok(withActivity.drivers.some((d) => /long unbroken/i.test(d)));
});

test("score is clamped to 100", () => {
  const many = Array.from({ length: 40 }, () =>
    item({ status: "overdue", gradeImpact: "high", dueAt: new Date(NOW - 3_600_000).toISOString() }),
  );
  const strain = computeWorkloadStrain(
    many,
    activityDay({ lateNightMinutes: 200, longestSessionMinutes: 300, activeMinutes: 400, breakCount: 0 }),
    NOW,
  );
  assert.ok(strain.score <= 100);
  assert.equal(strain.level, "heavy");
});
