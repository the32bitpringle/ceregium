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

export interface Integration {
  name: string;
  category: string;
  status: "connected" | "available" | "limited";
  detail: string;
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

export interface TokenSet {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
  scopes: string[];
}

export interface ConnectorConnection {
  id: string;
  userId: string;
  provider: string;
  encryptedTokens: string;
  scopes: string[];
}
