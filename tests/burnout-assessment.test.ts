import assert from "node:assert/strict";
import test from "node:test";
import { assessBurnoutPattern } from "../src/lib/burnout-assessment";
import type { Reflection, WorkloadItem } from "../src/lib/types";

function reflection(id: string, score: number): Reflection {
  return {
    id,
    createdAt: `2026-06-${id}`,
    text: "Schoolwork ran late and I had no recovery time.",
    ratings: { energy: 2, stress: 5, sleep: 2, workload: 5 },
    analysis: {
      status: "elevated",
      score,
      summary: "High demand with limited recovery.",
      themes: ["high workload", "reduced sleep"],
      protectiveFactors: [],
      balances: [],
      confidence: 0.8,
    },
  };
}

test("requires repeated entries before suggesting a sustained pattern", () => {
  const result = assessBurnoutPattern([reflection("01", 80)], []);
  assert.equal(result.likelihood, "insufficient");
  assert.match(result.conclusion, /not enough recent data/i);
});

test("flags a likely developing burnout pattern from repeated demand and low recovery", () => {
  const workload: WorkloadItem[] = [
    {
      id: "deadline",
      title: "Essay",
      source: "Manual",
      dueAt: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
      status: "upcoming",
    },
  ];
  const result = assessBurnoutPattern(
    [reflection("01", 78), reflection("02", 76), reflection("03", 80)],
    workload,
  );
  assert.equal(result.likelihood, "likely");
  assert.ok(result.score >= 72);
  assert.match(result.conclusion, /may be consistent with burnout developing/i);
  assert.ok(result.evidence.length >= 3);
});
