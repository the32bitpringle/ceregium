import type { AnalysisResult, ReflectionRatings } from "@/lib/types";
import { createBalancePairs } from "@/lib/balancing";

const themeRules: Array<{ theme: string; terms: string[] }> = [
  { theme: "late work", terms: ["late", "midnight", "all night", "stayed up"] },
  { theme: "missed breaks", terms: ["no break", "skipped break", "didn't stop", "forgot to eat"] },
  { theme: "high workload", terms: ["homework", "assignments", "project", "deadline", "quiz", "test"] },
  { theme: "low motivation", terms: ["couldn't focus", "no motivation", "procrastinated", "stuck"] },
  { theme: "social withdrawal", terms: ["alone", "ignored everyone", "didn't talk", "cancelled"] },
  { theme: "schedule compression", terms: ["back to back", "rushed", "no time", "too much"] },
];

const protectiveRules: Array<{ theme: string; terms: string[] }> = [
  { theme: "physical activity", terms: ["practice", "walk", "run", "gym", "exercise"] },
  { theme: "social connection", terms: ["friend", "family", "team", "club", "talked"] },
  { theme: "intentional recovery", terms: ["break", "rested", "relaxed", "slept", "outside"] },
  { theme: "enjoyment", terms: ["enjoyed", "fun", "happy", "proud", "good"] },
];

export function analyzeReflection(
  text: string,
  ratings: ReflectionRatings,
  analysisEnabled: boolean,
): AnalysisResult {
  if (!analysisEnabled) {
    return {
      status: "steady",
      score: 0,
      summary: "Saved privately without AI pattern analysis.",
      themes: [],
      protectiveFactors: [],
      balances: [],
      confidence: 1,
    };
  }

  const normalized = text.toLowerCase();
  const themes = themeRules
    .filter((rule) => rule.terms.some((term) => normalized.includes(term)))
    .map((rule) => rule.theme);
  const protectiveFactors = protectiveRules
    .filter((rule) => rule.terms.some((term) => normalized.includes(term)))
    .map((rule) => rule.theme);

  const ratingPressure =
    (6 - ratings.energy) * 5 +
    ratings.stress * 6 +
    (6 - ratings.sleep) * 5 +
    ratings.workload * 6;
  const score = Math.max(
    18,
    Math.min(94, Math.round(ratingPressure * 0.72 + themes.length * 6 - protectiveFactors.length * 3)),
  );

  const status = score >= 68 ? "elevated" : score >= 48 ? "watch" : "steady";

  const summary =
    status === "elevated"
        ? "Your day shows signs of high demand with limited recovery."
        : status === "watch"
          ? "Some parts of your routine may be using more capacity than usual."
          : "This entry shows a generally manageable balance of demand and recovery.";

  return {
    status,
    score,
    summary,
    themes,
    protectiveFactors,
    balances: createBalancePairs(themes, protectiveFactors),
    confidence: Math.min(0.91, 0.58 + themes.length * 0.07 + protectiveFactors.length * 0.04),
  };
}
