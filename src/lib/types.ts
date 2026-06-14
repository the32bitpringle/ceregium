export type View =
  | "dashboard"
  | "reflect"
  | "patterns"
  | "integrations"
  | "workload"
  | "safety"
  | "privacy"
  | "settings";

export type SignalStatus = "steady" | "watch" | "elevated" | "critical";

export interface ReflectionRatings {
  energy: number;
  stress: number;
  sleep: number;
  workload: number;
}

export interface AnalysisResult {
  status: SignalStatus;
  score: number;
  summary: string;
  themes: string[];
  protectiveFactors: string[];
  balances: BalancePair[];
  confidence: number;
  immediateSafetyConcern?: boolean;
  model?: string;
}

export interface BalancePair {
  concern: string;
  support: string;
}

export interface Reflection {
  id: string;
  createdAt: string;
  text: string;
  ratings: ReflectionRatings;
  analysis: AnalysisResult;
}

export type BurnoutLikelihood = "insufficient" | "unlikely" | "possible" | "likely";

export interface PatternAssessment {
  likelihood: BurnoutLikelihood;
  score: number;
  confidence: number;
  conclusion: string;
  evidence: string[];
  recommendation: string;
}

export interface BrowserActivityDay {
  localDate: string;
  activeMinutes: number;
  educationMinutes: number;
  productivityMinutes: number;
  socialMinutes: number;
  entertainmentMinutes: number;
  otherMinutes: number;
  lateNightMinutes: number;
  longestSessionMinutes: number;
  tabSwitches: number;
  breakCount: number;
}

export interface WellbeingExercise {
  id: string;
  title: string;
  duration: string;
  reason: string;
  steps: string[];
}

export interface SchedulePlanAction {
  title: string;
  reason: string;
  timing: string;
  assignmentId?: string;
  kind: "protect" | "reduce" | "move" | "ask" | "recover";
}

export interface ScheduleEasePlan {
  id?: string;
  summary: string;
  actions: SchedulePlanAction[];
  guardrail: string;
  model: string;
  createdAt?: string;
}

export interface Integration {
  name: string;
  category: string;
  status: "connected" | "available" | "limited";
  detail: string;
}

export interface DetectedIntegration {
  name: string;
  category: string;
}

export type WorkloadStrainLevel = "light" | "moderate" | "heavy";

export interface WorkloadStrain {
  score: number;
  level: WorkloadStrainLevel;
  drivers: string[];
}

export interface AppSettings {
  timezone: string;
  reducedMotion: boolean;
  digestEnabled: boolean;
  digestHour: number;
  analysisEnabled: boolean;
}

export interface WorkloadItem {
  id: string;
  title: string;
  source: string;
  dueAt: string;
  status: "upcoming" | "submitted" | "overdue";
  course?: string;
  pointsPossible?: number;
  gradeImpact?: "low" | "medium" | "high" | "unknown";
}
