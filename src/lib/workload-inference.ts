import type { WorkloadItem } from "@/lib/types";

type KnownImpact = "low" | "medium" | "high";

// Title keywords, checked most-significant first. A high-impact word anywhere in
// the title wins over a medium one, which wins over a low one.
const HIGH_KEYWORDS = [
  "final",
  "exam",
  "midterm",
  "project",
  "paper",
  "essay",
  "presentation",
  "thesis",
  "capstone",
  "portfolio",
];

const LOW_KEYWORDS = [
  "discussion",
  "reading",
  "optional",
  "practice",
  "survey",
  "check-in",
  "warm-up",
  "warmup",
  "extra credit",
  "reflection",
];

const MEDIUM_KEYWORDS = [
  "quiz",
  "lab",
  "homework",
  "assignment",
  "problem set",
  "pset",
  "worksheet",
  "report",
];

function keywordImpact(title: string): KnownImpact | null {
  const text = title.toLowerCase();
  if (HIGH_KEYWORDS.some((word) => text.includes(word))) return "high";
  if (LOW_KEYWORDS.some((word) => text.includes(word))) return "low";
  if (MEDIUM_KEYWORDS.some((word) => text.includes(word))) return "medium";
  return null;
}

/**
 * Estimate how much an assignment affects a grade from its title and point value.
 * Keyword signals take priority; point totals act only as a tiebreaker. Returns a
 * concrete impact (never "unknown") so auto-imported work gets a usable default
 * the student can still override.
 */
export function inferGradeImpact(
  title: string,
  pointsPossible?: number,
): KnownImpact {
  const byKeyword = keywordImpact(title);
  if (byKeyword) return byKeyword;
  if (typeof pointsPossible === "number") {
    if (pointsPossible >= 100) return "high";
    if (pointsPossible <= 10) return "low";
  }
  return "medium";
}

export type DetectedAssignment = Pick<
  WorkloadItem,
  "title" | "pointsPossible"
>;

export function inferImpactForItem(item: DetectedAssignment): KnownImpact {
  return inferGradeImpact(item.title, item.pointsPossible);
}
