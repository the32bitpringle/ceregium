import type { BalancePair, WorkloadItem } from "@/lib/types";

const supportByTheme: Record<string, string> = {
  "late work": "Choose a stopping time tonight and move one non-urgent task to tomorrow.",
  "missed breaks": "Protect one 20-minute break before beginning the next task.",
  "high workload": "Pick the single most time-sensitive task and define a smaller first step.",
  "low motivation": "Start with ten focused minutes, then decide whether to continue or rest.",
  "social withdrawal": "Send one low-pressure message to someone who usually feels supportive.",
  "schedule compression": "Create one buffer between commitments, even if it is only ten minutes.",
  "reduced sleep": "Set a realistic wind-down time and avoid adding another optional task tonight.",
};

export function createBalancePairs(
  themes: string[],
  protectiveFactors: string[],
): BalancePair[] {
  return themes.map((theme, index) => ({
    concern: theme,
    support:
      supportByTheme[theme.toLowerCase()] ??
      (protectiveFactors[index % Math.max(protectiveFactors.length, 1)]
        ? `Make room for ${protectiveFactors[index % protectiveFactors.length]}, which has been a supportive part of your routine.`
        : "Choose one small action that restores time, rest, or support before adding more work."),
  }));
}

export function workloadSupport(item: WorkloadItem, strainScore = 0) {
  const hoursUntilDue = (new Date(item.dueAt).getTime() - Date.now()) / 3_600_000;
  if (item.gradeImpact === "low" && strainScore >= 52) {
    return "This is marked low impact. If capacity is limited, consider a minimal submission or missing it after checking the late-work policy.";
  }
  if (item.gradeImpact === "high") {
    return "Protect a focused block for this high-impact assignment and reduce effort on a lower-impact task instead.";
  }
  if (item.gradeImpact === "medium") {
    return "Aim for a complete, good-enough submission and avoid spending recovery time on optional polish.";
  }
  if (item.status === "overdue") {
    return "Ask what can still be submitted, then complete the smallest acceptable next step.";
  }
  if (hoursUntilDue <= 12) {
    return "Set a short first work block now and decide what “good enough” means before starting.";
  }
  if (hoursUntilDue <= 48) {
    return "Reserve one focused block and one recovery break before the deadline.";
  }
  if (item.pointsPossible !== undefined) {
    return `${item.pointsPossible} points are listed, but total grade impact is unknown. Check the syllabus before deciding to skip it.`;
  }
  return "Break this into a first step now so it does not compete with later deadlines. Confirm grade impact before choosing to skip it.";
}
