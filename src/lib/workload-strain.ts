import type {
  BrowserActivityDay,
  WorkloadItem,
  WorkloadStrain,
  WorkloadStrainLevel,
} from "@/lib/types";

const IMPACT_WEIGHT: Record<string, number> = {
  high: 3,
  medium: 2,
  unknown: 1.5,
  low: 1,
};

const HOUR = 3_600_000;

function urgencyWeight(hoursUntilDue: number, overdue: boolean): number {
  if (overdue) return 4;
  if (hoursUntilDue <= 24) return 3;
  if (hoursUntilDue <= 72) return 2;
  if (hoursUntilDue <= 168) return 1;
  return 0.25;
}

/**
 * Derive a 0-100 workload-strain score from upcoming deadline pressure and (when
 * available) today's aggregate browser-activity signals. Pure and deterministic
 * apart from the supplied `now`, which defaults to the current time.
 */
export function computeWorkloadStrain(
  items: WorkloadItem[],
  today?: BrowserActivityDay,
  now: number = Date.now(),
): WorkloadStrain {
  const drivers: string[] = [];

  let pressure = 0;
  let urgentCount = 0;
  let overdueCount = 0;
  for (const item of items) {
    if (item.status === "submitted") continue;
    const due = new Date(item.dueAt).getTime();
    if (Number.isNaN(due)) continue;
    const overdue = item.status === "overdue" || due < now;
    const hoursUntilDue = (due - now) / HOUR;
    const weight =
      IMPACT_WEIGHT[item.gradeImpact ?? "unknown"] ?? IMPACT_WEIGHT.unknown;
    pressure += weight * urgencyWeight(hoursUntilDue, overdue);
    if (overdue) overdueCount += 1;
    else if (hoursUntilDue <= 72) urgentCount += 1;
  }

  const deadlineScore = Math.min(70, pressure * 2.5);
  if (overdueCount > 0) {
    drivers.push(
      `${overdueCount} overdue ${overdueCount === 1 ? "item" : "items"}`,
    );
  }
  if (urgentCount > 0) {
    drivers.push(
      `${urgentCount} due within 3 days`,
    );
  }

  let activityScore = 0;
  if (today) {
    if (today.lateNightMinutes >= 45) {
      activityScore += Math.min(10, today.lateNightMinutes / 9);
      drivers.push("late-night screen time");
    }
    if (today.longestSessionMinutes >= 120) {
      activityScore += Math.min(10, (today.longestSessionMinutes - 60) / 6);
      drivers.push("long unbroken sessions");
    }
    if (today.activeMinutes >= 180 && today.breakCount <= 1) {
      activityScore += 10;
      drivers.push("few breaks during a long day");
    }
  }

  const score = Math.min(100, Math.round(deadlineScore + activityScore));
  const level: WorkloadStrainLevel =
    score < 34 ? "light" : score < 67 ? "moderate" : "heavy";

  return { score, level, drivers };
}
