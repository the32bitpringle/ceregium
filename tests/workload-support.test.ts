import assert from "node:assert/strict";
import test from "node:test";
import { workloadSupport } from "../src/lib/balancing";
import type { WorkloadItem } from "../src/lib/types";

function item(overrides: Partial<WorkloadItem> = {}): WorkloadItem {
  return {
    id: "assignment",
    title: "Assignment",
    source: "Manual",
    dueAt: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
    status: "upcoming",
    ...overrides,
  };
}

test("only suggests missing work when the student marked it low impact", () => {
  const result = workloadSupport(item({ gradeImpact: "low" }), 75);
  assert.match(result, /consider a minimal submission or missing it/i);
  assert.match(result, /checking the late-work policy/i);
});

test("does not suggest skipping when grade impact is unknown", () => {
  const result = workloadSupport(item({ gradeImpact: "unknown", pointsPossible: 5 }), 75);
  assert.doesNotMatch(result, /missing it/i);
  assert.match(result, /grade impact is unknown/i);
});

test("protects high-impact work and redirects effort from lower-impact work", () => {
  const result = workloadSupport(item({ gradeImpact: "high" }), 75);
  assert.match(result, /high-impact assignment/i);
  assert.match(result, /lower-impact task/i);
});

test("treats medium impact as known and recommends a good-enough submission", () => {
  const result = workloadSupport(item({ gradeImpact: "medium", pointsPossible: 20 }), 75);
  assert.match(result, /good-enough submission/i);
  assert.doesNotMatch(result, /impact is unknown/i);
});
