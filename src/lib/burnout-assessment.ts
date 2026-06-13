import type { PatternAssessment, Reflection, WorkloadItem } from "@/lib/types";

export function assessBurnoutPattern(
  reflections: Reflection[],
  workload: WorkloadItem[],
): PatternAssessment {
  const recent = reflections.slice(0, 7);
  if (recent.length < 2) {
    return {
      likelihood: "insufficient",
      score: recent[0]?.analysis.score ?? 0,
      confidence: 0.35,
      conclusion: "There is not enough recent data to assess a sustained burnout pattern.",
      evidence: ["At least two daily reflections are needed to compare changes over time."],
      recommendation: "Keep checking in daily so Ceregium can distinguish a hard day from a pattern.",
    };
  }

  const averageSignal =
    recent.reduce((total, entry) => total + entry.analysis.score, 0) / recent.length;
  const highDemandDays = recent.filter(
    (entry) => entry.ratings.stress >= 4 && entry.ratings.workload >= 4,
  ).length;
  const lowRecoveryDays = recent.filter(
    (entry) => entry.ratings.sleep <= 2 || entry.ratings.energy <= 2,
  ).length;
  const themeCounts = new Map<string, number>();
  recent.forEach((entry) => {
    entry.analysis.themes.forEach((theme) => {
      themeCounts.set(theme, (themeCounts.get(theme) ?? 0) + 1);
    });
  });
  const repeatedThemes = [...themeCounts.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1]);
  const urgentWork = workload.filter((item) => {
    const hours = (new Date(item.dueAt).getTime() - Date.now()) / 3_600_000;
    return item.status === "overdue" || (hours >= 0 && hours <= 48);
  }).length;

  const score = Math.min(
    96,
    Math.round(
      averageSignal * 0.55 +
        (highDemandDays / recent.length) * 18 +
        (lowRecoveryDays / recent.length) * 14 +
        Math.min(8, repeatedThemes.length * 4) +
        Math.min(5, urgentWork * 2),
    ),
  );
  const likelihood = score >= 72 ? "likely" : score >= 52 ? "possible" : "unlikely";
  const evidence = [
    highDemandDays
      ? `${highDemandDays} of ${recent.length} recent entries combine high stress with high workload.`
      : "",
    lowRecoveryDays
      ? `${lowRecoveryDays} of ${recent.length} recent entries show low sleep or low energy.`
      : "",
    repeatedThemes[0]
      ? `“${repeatedThemes[0][0]}” repeats across ${repeatedThemes[0][1]} entries.`
      : "",
    urgentWork ? `${urgentWork} commitments are due or overdue within 48 hours.` : "",
  ].filter(Boolean);

  return {
    likelihood,
    score,
    confidence: Number(
      Math.min(0.92, 0.48 + recent.length * 0.055 + repeatedThemes.length * 0.04).toFixed(2),
    ),
    conclusion:
      likelihood === "likely"
        ? "Your recent pattern may be consistent with burnout developing."
        : likelihood === "possible"
          ? "Your recent pattern shows some early signs associated with burnout."
          : "Your recent pattern does not currently show strong signs of burnout.",
    evidence,
    recommendation:
      likelihood === "likely"
        ? "Reduce one low-impact demand, protect sleep tonight, and tell a trusted person that your capacity is running low."
        : likelihood === "possible"
          ? "Protect one recovery block and reassess which commitments truly need full effort."
          : "Keep the routines that restore energy and continue checking for repeated changes.",
  };
}
