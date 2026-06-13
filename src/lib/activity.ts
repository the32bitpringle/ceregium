import type { BrowserActivityDay } from "@/lib/types";

export function mapActivityDay(row: Record<string, unknown>): BrowserActivityDay {
  return {
    localDate: String(row.local_date),
    activeMinutes: Number(row.active_minutes),
    educationMinutes: Number(row.education_minutes),
    productivityMinutes: Number(row.productivity_minutes),
    socialMinutes: Number(row.social_minutes),
    entertainmentMinutes: Number(row.entertainment_minutes),
    otherMinutes: Number(row.other_minutes),
    lateNightMinutes: Number(row.late_night_minutes),
    longestSessionMinutes: Number(row.longest_session_minutes),
    tabSwitches: Number(row.tab_switches),
    breakCount: Number(row.break_count),
  };
}
