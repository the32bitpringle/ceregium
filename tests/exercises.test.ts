import assert from "node:assert/strict";
import test from "node:test";
import { recommendedExercises } from "../src/lib/exercises";
import type { PatternAssessment, Reflection } from "../src/lib/types";

const assessment: PatternAssessment = {
  likelihood: "likely",
  score: 78,
  confidence: 0.8,
  conclusion: "A repeated strain pattern may be developing.",
  evidence: [],
  recommendation: "Reduce demand and restore recovery.",
};

function reflection(themes: string[]): Reflection {
  return {
    id: "reflection",
    createdAt: "2026-06-13",
    text: "I worked late and skipped breaks.",
    ratings: { energy: 2, stress: 5, sleep: 2, workload: 5 },
    analysis: {
      status: "elevated",
      score: 78,
      summary: "High demand with limited recovery.",
      themes,
      protectiveFactors: [],
      balances: [],
      confidence: 0.8,
    },
  };
}

test("recommends concrete recovery and sleep exercises for matching patterns", () => {
  const result = recommendedExercises(
    [reflection(["missed breaks", "late work", "reduced sleep"])],
    assessment,
  );
  const ids = result.map((exercise) => exercise.id);
  assert.ok(ids.includes("paced-breathing"));
  assert.ok(ids.includes("screen-free-reset"));
  assert.ok(ids.includes("wind-down-boundary"));
  assert.ok(result.every((exercise) => exercise.steps.length >= 3));
});

test("always offers a grounding exercise without overstating a diagnosis", () => {
  const result = recommendedExercises([], { ...assessment, likelihood: "insufficient", score: 0 });
  assert.deepEqual(result.map((exercise) => exercise.id), ["five-senses"]);
});

test("uses aggregate late-night and long-session signals to recommend recovery exercises", () => {
  const result = recommendedExercises(
    [],
    assessment,
    [{
      localDate: "2026-06-13",
      activeMinutes: 300,
      educationMinutes: 180,
      productivityMinutes: 50,
      socialMinutes: 30,
      entertainmentMinutes: 20,
      otherMinutes: 20,
      lateNightMinutes: 60,
      longestSessionMinutes: 140,
      tabSwitches: 240,
      breakCount: 1,
    }],
  );
  const ids = result.map((exercise) => exercise.id);
  assert.ok(ids.includes("screen-free-reset"));
  assert.ok(ids.includes("wind-down-boundary"));
});
