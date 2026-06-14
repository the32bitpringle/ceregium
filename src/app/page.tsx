"use client";

import {
  Activity,
  BookOpen,
  CalendarDays,
  Check,
  ChevronRight,
  Download,
  HeartHandshake,
  LayoutDashboard,
  Link2,
  LockKeyhole,
  LogOut,
  Menu,
  MessageCircleMore,
  NotebookPen,
  Settings,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { createBalancePairs, workloadSupport } from "@/lib/balancing";
import { assessBurnoutPattern } from "@/lib/burnout-assessment";
import { recommendedExercises } from "@/lib/exercises";
import type {
  AppSettings,
  AnalysisResult,
  BrowserActivityDay,
  DetectedIntegration,
  Integration,
  Reflection,
  ReflectionRatings,
  ScheduleEasePlan,
  View,
  WorkloadItem,
  WorkloadStrain,
} from "@/lib/types";

const baseIntegrations: Integration[] = [
  { name: "Browser companion", category: "Browser", status: "available", detail: "Automatically summarizes opt-in activity patterns and imports assignments it detects" },
  { name: "Manual entry", category: "School", status: "connected", detail: "Add assignments directly without another account" },
];

const navItems: Array<{ view: View; label: string; icon: typeof LayoutDashboard }> = [
  { view: "dashboard", label: "Today", icon: LayoutDashboard },
  { view: "reflect", label: "Daily reflection", icon: NotebookPen },
  { view: "patterns", label: "Patterns", icon: Activity },
  { view: "integrations", label: "Integrations", icon: Link2 },
  { view: "workload", label: "Workload", icon: CalendarDays },
  { view: "safety", label: "Safety plan", icon: HeartHandshake },
];

const defaultRatings: ReflectionRatings = {
  energy: 3,
  stress: 3,
  sleep: 3,
  workload: 3,
};

const defaultSettings: AppSettings = {
  timezone: "America/Los_Angeles",
  reducedMotion: false,
  digestEnabled: true,
  digestHour: 7,
  analysisEnabled: true,
};

const APP_LOADED_AT = Date.now();

interface RuntimeConfig {
  mode: "local";
  services: {
    sqlite: boolean;
    openrouter: boolean;
    browserCompanion: boolean;
  };
}

interface LocalUser {
  id: string;
  email: string;
  displayName: string;
  dateOfBirth: string;
  timezone: string;
}

interface BrowserPairing {
  id: string;
  label: string;
  last_used_at?: string;
  created_at: string;
}

function StatusMark({ status }: { status: AnalysisResult["status"] }) {
  return <span className={`status-mark status-${status}`}>{status}</span>;
}

function MatchstickCapacity({ score }: { score: number }) {
  const burned = Math.round(score / 10);
  return (
    <div
      className="matchstick-visual"
      role="img"
      aria-label={`${burned} of 10 matchsticks show accumulated strain`}
    >
      <div className="matchsticks" aria-hidden="true">
        {Array.from({ length: 10 }, (_, index) => (
          <span
            key={index}
            className={index >= 10 - burned ? "match-burned" : "match-intact"}
          >
            <i />
          </span>
        ))}
      </div>
      <div className="matchstick-scale">
        <span>capacity available</span>
        <span>strain accumulated</span>
      </div>
    </div>
  );
}

function RatingInput({
  label,
  value,
  onChange,
  low,
  high,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  low: string;
  high: string;
}) {
  return (
    <label className="rating-field">
      <span>{label}</span>
      <input
        type="range"
        min="1"
        max="5"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <span className="rating-scale">
        <span>{low}</span>
        <strong>{value}/5</strong>
        <span>{high}</span>
      </span>
    </label>
  );
}

function AuthPanel({ onAuthenticated }: { onAuthenticated: () => void }) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const response = await fetch(mode === "signup" ? "/api/auth/signup" : "/api/auth/signin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, dateOfBirth, displayName }),
    });
    const result = await response.json();
    if (!response.ok) setMessage(result.error ?? "Could not sign in.");
    else onAuthenticated();
    setBusy(false);
  }

  return (
    <main className="auth-page">
      <section className="auth-panel">
        <div className="brand auth-brand">
          <div className="brand-symbol" aria-hidden="true"><span /><span /></div>
          <span>Ceregium</span>
        </div>
        <div className="auth-copy">
          <h1>{mode === "signin" ? "Sign in" : "Create your private workspace"}</h1>
          <p>Your reflections and connected data stay private from your school.</p>
        </div>
        <form onSubmit={submit}>
          {mode === "signup" && (
            <>
              <label>
                Name
                <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} required />
              </label>
              <label>
                Date of birth
                <input type="date" value={dateOfBirth} onChange={(event) => setDateOfBirth(event.target.value)} required />
              </label>
            </>
          )}
          <label>
            Email
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </label>
          <label>
            Password
            <input type="password" minLength={10} value={password} onChange={(event) => setPassword(event.target.value)} required />
          </label>
          {message && <p className="form-message">{message}</p>}
          <button className="primary-button" disabled={busy}>
            {busy ? "Working..." : mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>
        <button className="text-button" onClick={() => setMode(mode === "signin" ? "signup" : "signin")}>
          {mode === "signin" ? "Create an account" : "Use an existing account"}
        </button>
        <p className="auth-footnote">You must be at least 13 years old to use Ceregium.</p>
      </section>
    </main>
  );
}

export default function Home() {
  const [runtime, setRuntime] = useState<RuntimeConfig | null>(null);
  const [startupError, setStartupError] = useState("");
  const [user, setUser] = useState<LocalUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [view, setView] = useState<View>("dashboard");
  const [menuOpen, setMenuOpen] = useState(false);
  const [reflection, setReflection] = useState("");
  const [ratings, setRatings] = useState(defaultRatings);
  const [reflections, setReflections] = useState<Reflection[]>([]);
  const [connected, setConnected] = useState<string[]>(["Manual entry"]);
  const [detectedIntegrations, setDetectedIntegrations] = useState<DetectedIntegration[]>([]);
  const [workloadStrain, setWorkloadStrain] = useState<WorkloadStrain | null>(null);
  const [analysisEnabled, setAnalysisEnabled] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [trustedContact, setTrustedContact] = useState("");
  const [safetyActive, setSafetyActive] = useState(false);
  const [verificationId, setVerificationId] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [verificationPreview, setVerificationPreview] = useState("");
  const [safetyMessage, setSafetyMessage] = useState("");
  const [contactVerified, setContactVerified] = useState(false);
  const [workload, setWorkload] = useState<WorkloadItem[]>([]);
  const [pairings, setPairings] = useState<BrowserPairing[]>([]);
  const [pairingToken, setPairingToken] = useState("");
  const [showWorkloadForm, setShowWorkloadForm] = useState(false);
  const [manualTitle, setManualTitle] = useState("");
  const [manualCourse, setManualCourse] = useState("");
  const [manualDueAt, setManualDueAt] = useState("");
  const [manualPoints, setManualPoints] = useState("");
  const [manualImpact, setManualImpact] =
    useState<NonNullable<WorkloadItem["gradeImpact"]>>("unknown");
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [activity, setActivity] = useState<BrowserActivityDay[]>([]);
  const [schedulePlan, setSchedulePlan] = useState<ScheduleEasePlan | null>(null);
  const [actionMessage, setActionMessage] = useState("");

  useEffect(() => {
    let active = true;
    Promise.all([fetch("/api/config"), fetch("/api/auth/session")])
      .then(async ([configResponse, sessionResponse]) => {
        const [config, sessionData] = await Promise.all([
          configResponse.json(),
          sessionResponse.json(),
        ]);
        if (!active) return;
        setRuntime(config);
        setUser(sessionData.user ?? null);
        setAuthReady(true);
      })
      .catch(() => {
        if (active) setStartupError("Ceregium could not load its local workspace.");
      });
    return () => {
      active = false;
    };
  }, []);

  async function refreshSession() {
    const [configResponse, sessionResponse] = await Promise.all([
      fetch("/api/config"),
      fetch("/api/auth/session"),
    ]);
    const [config, sessionData] = await Promise.all([
      configResponse.json(),
      sessionResponse.json(),
    ]);
    setRuntime(config);
    setUser(sessionData.user ?? null);
    setAuthReady(true);
  }

  useEffect(() => {
    if (!user) return;
    Promise.all([
      fetch("/api/reflections").then((response) => response.json()),
      fetch("/api/integrations/status").then((response) => response.json()),
      fetch("/api/workload").then((response) => response.json()),
      fetch("/api/settings").then((response) => response.json()),
      fetch("/api/browser/activity").then((response) => response.json()),
    ])
      .then(([reflectionData, integrationData, workloadData, settingsData, activityData]) => {
        setReflections(reflectionData.reflections ?? []);
        setPairings(integrationData.pairings ?? []);
        const detected: DetectedIntegration[] = integrationData.detectedIntegrations ?? [];
        setDetectedIntegrations(detected);
        setConnected([
          "Manual entry",
          ...(integrationData.pairings?.length ? ["Browser companion"] : []),
          ...detected.map((entry) => entry.name),
        ]);
        setWorkload(workloadData.items ?? []);
        setWorkloadStrain(workloadData.strain ?? null);
        setActivity(activityData.activity ?? []);
        if (settingsData.settings) setSettings(settingsData.settings);
      })
      .catch(() => setStartupError("Ceregium could not load your private workspace."));
  }, [user]);

  useEffect(() => {
    if (!user) return;
    let activeRequest = true;
    const refreshActivity = () => {
      fetch("/api/browser/activity")
        .then((response) => response.json())
        .then((result) => {
          if (activeRequest) setActivity(result.activity ?? []);
        });
    };
    const timer = window.setInterval(refreshActivity, 5 * 60 * 1000);
    window.addEventListener("focus", refreshActivity);
    return () => {
      activeRequest = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshActivity);
    };
  }, [user]);

  const latest = reflections[0]?.analysis;
  const allIntegrations = useMemo<Integration[]>(() => {
    const detected: Integration[] = detectedIntegrations
      .filter((entry) => !baseIntegrations.some((base) => base.name === entry.name))
      .map((entry) => ({
        name: entry.name,
        category: entry.category,
        status: "connected",
        detail: "Detected automatically by the browser companion",
      }));
    return [...baseIntegrations, ...detected];
  }, [detectedIntegrations]);
  const patternAssessment = useMemo(
    () => assessBurnoutPattern(reflections, workload, activity),
    [reflections, workload, activity],
  );
  const exercises = useMemo(
    () => recommendedExercises(reflections, patternAssessment, activity),
    [reflections, patternAssessment, activity],
  );
  const upcomingWork = useMemo(
    () => workload.filter((item) => item.status !== "submitted").slice(0, 3),
    [workload],
  );
  const urgentWorkCount = useMemo(
    () =>
      workload.filter((item) => {
        const hours = (new Date(item.dueAt).getTime() - APP_LOADED_AT) / 3_600_000;
        return item.status === "overdue" || (hours >= 0 && hours <= 48);
      }).length,
    [workload],
  );
  const patternStatus: AnalysisResult["status"] =
    patternAssessment.likelihood === "likely"
      ? "elevated"
      : patternAssessment.likelihood === "possible"
        ? "watch"
        : "steady";

  const patternCounts = useMemo(() => {
    const counts = new Map<string, number>();
    reflections.forEach((entry) =>
      entry.analysis.themes.forEach((theme) => counts.set(theme, (counts.get(theme) ?? 0) + 1)),
    );
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  }, [reflections]);
  const scheduleInputKey = useMemo(
    () =>
      JSON.stringify({
        score: patternAssessment.score,
        reflections: reflections.map((entry) => entry.id),
        workload: workload.map((item) => [item.id, item.dueAt, item.gradeImpact]),
        activity: activity.map((day) => [
          day.localDate,
          day.activeMinutes,
          day.lateNightMinutes,
        ]),
      }),
    [activity, patternAssessment.score, reflections, workload],
  );

  useEffect(() => {
    if (!user || patternAssessment.score < 52) return;
    let activeRequest = true;
    fetch("/api/schedule-plan", { method: "POST" })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Could not create schedule plan.");
        if (activeRequest) setSchedulePlan(result.plan);
      })
      .catch((error) => {
        if (activeRequest) setActionMessage(String(error.message || error));
      });
    return () => {
      activeRequest = false;
    };
  }, [user, patternAssessment.score, scheduleInputKey]);

  async function submitReflection(event: FormEvent) {
    event.preventDefault();
    if (!reflection.trim()) return;
    setSubmitting(true);

    const response = await fetch("/api/reflections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: reflection, ratings, analysisEnabled }),
    });
    const result = await response.json();
    if (!response.ok) {
      setActionMessage(result.error ?? "Could not save reflection");
      setSubmitting(false);
      return;
    }
    const entry: Reflection = result.reflection;
    const next = [entry, ...reflections.filter((item) => item.id !== entry.id)];
    setReflections(next);
    setReflection("");
    setRatings(defaultRatings);
    setSubmitting(false);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2500);
  }

  async function createBrowserPairing() {
    const response = await fetch("/api/browser/pairings", { method: "POST" });
    const result = await response.json();
    if (!response.ok) return setActionMessage(result.error);
    setPairingToken(result.pairing.token);
    const status = await fetch("/api/browser/pairings").then((item) => item.json());
    setPairings(status.pairings ?? []);
    setConnected(["Manual entry", "Browser companion"]);
  }

  async function revokeBrowserPairing(id: string) {
    const response = await fetch(`/api/browser/pairings?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    if (!response.ok) return setActionMessage("Could not revoke browser pairing.");
    setPairings((current) => current.filter((pairing) => pairing.id !== id));
    setPairingToken("");
    setConnected(["Manual entry"]);
    setActionMessage("Browser pairing revoked.");
  }

  async function deleteBrowserActivity() {
    const response = await fetch("/api/browser/activity", { method: "DELETE" });
    if (!response.ok) return setActionMessage("Could not delete synced activity.");
    setActivity([]);
    setSchedulePlan(null);
    setActionMessage("Synced browser activity and generated schedule plans deleted.");
  }

  async function updateGradeImpact(
    item: WorkloadItem,
    gradeImpact: NonNullable<WorkloadItem["gradeImpact"]>,
  ) {
    setWorkload((current) =>
      {
        const next = current.map((candidate) =>
        candidate.id === item.id ? { ...candidate, gradeImpact } : candidate,
        );
        return next;
      },
    );
    const response = await fetch("/api/workload", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: item.id, gradeImpact }),
    });
    if (!response.ok) {
      const result = await response.json();
      setActionMessage(result.error ?? "Could not update grade impact.");
    }
  }

  async function addManualWorkload(event: FormEvent) {
    event.preventDefault();
    const dueAt = new Date(manualDueAt);
    if (!manualTitle.trim() || Number.isNaN(dueAt.getTime())) return;
    const payload = {
      title: manualTitle.trim(),
      course: manualCourse.trim() || undefined,
      dueAt: dueAt.toISOString(),
      pointsPossible: manualPoints ? Number(manualPoints) : undefined,
      gradeImpact: manualImpact,
    };
    const response = await fetch("/api/workload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await response.json();
    if (!response.ok) return setActionMessage(result.error ?? "Could not add assignment.");
    const item: WorkloadItem = result.item;
    const next = [...workload, item].sort(
      (a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime(),
    );
    setWorkload(next);
    setManualTitle("");
    setManualCourse("");
    setManualDueAt("");
    setManualPoints("");
    setManualImpact("unknown");
    setShowWorkloadForm(false);
    setActionMessage("Assignment added.");
  }

  async function deleteManualWorkload(item: WorkloadItem) {
    const response = await fetch(`/api/workload/${item.id}`, { method: "DELETE" });
    const result = await response.json();
    if (!response.ok) return setActionMessage(result.error ?? "Could not delete assignment.");
    const next = workload.filter((candidate) => candidate.id !== item.id);
    setWorkload(next);
    setActionMessage("Assignment deleted.");
  }

  async function requestVerification() {
    setSafetyMessage("");
    const response = await fetch("/api/safety-plan/request-verification", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ destination: trustedContact }),
    });
    const result = await response.json();
    if (!response.ok) return setSafetyMessage(result.error);
    setVerificationId(result.verificationId);
    setVerificationPreview(result.previewCode ?? "");
    setVerificationCode("LOCAL");
    setSafetyMessage("Contact saved locally. Confirm with the code LOCAL.");
  }

  async function confirmVerification() {
    const response = await fetch("/api/safety-plan/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ verificationId, code: verificationCode, active: safetyActive }),
    });
    const result = await response.json();
    if (!response.ok) return setSafetyMessage(result.error);
    setContactVerified(true);
    setSafetyMessage("Trusted contact verified.");
  }

  async function sendTestNotification() {
    const response = await fetch("/api/safety-plan/test", { method: "POST" });
    const result = await response.json();
    setSafetyMessage(
      result.delivered ? "Test notification delivered." : "Local safety-plan test completed.",
    );
  }

  async function saveSettings() {
    const response = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });
    const result = await response.json();
    setActionMessage(response.ok ? "Settings saved." : result.error);
  }

  async function exportData() {
    const response = await fetch("/api/privacy/export");
    const data: unknown = await response.json();
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `ceregium-export-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function deleteAccount() {
    const confirmation = window.prompt("Type DELETE to permanently remove your Ceregium data.");
    if (confirmation !== "DELETE") return;
    const response = await fetch("/api/privacy/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmation }),
    });
    if (!response.ok) {
      const result = await response.json();
      return setActionMessage(result.error);
    }
    setUser(null);
  }

  async function signOut() {
    await fetch("/api/auth/signout", { method: "POST" });
    setUser(null);
    setReflections([]);
    setWorkload([]);
    setPairings([]);
  }

  function selectView(next: View) {
    setView(next);
    setMenuOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (startupError) {
    return (
      <main className="error-page">
        <section>
          <h1>Workspace unavailable</h1>
          <p>{startupError} Your saved data was not changed.</p>
          <button className="primary-button" onClick={() => window.location.reload()}>
            Try again
          </button>
        </section>
      </main>
    );
  }

  if (!runtime || !authReady) {
    return <main className="loading-page">Loading Ceregium...</main>;
  }

  if (!user) return <AuthPanel onAuthenticated={refreshSession} />;

  return (
    <div className="app-frame">
      <aside className={`sidebar ${menuOpen ? "sidebar-open" : ""}`}>
        <div className="brand">
          <div className="brand-symbol" aria-hidden="true">
            <span />
            <span />
          </div>
          <span>Ceregium</span>
          <button className="mobile-close" onClick={() => setMenuOpen(false)} aria-label="Close menu">
            <X size={20} />
          </button>
        </div>

        <nav aria-label="Main navigation">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.view}
                className={view === item.view ? "nav-active" : ""}
                onClick={() => selectView(item.view)}
              >
                <Icon size={18} strokeWidth={1.8} />
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="sidebar-bottom">
          <button onClick={() => selectView("privacy")}>
            <ShieldCheck size={18} strokeWidth={1.8} />
            Privacy
          </button>
          <button onClick={() => selectView("settings")}>
            <Settings size={18} strokeWidth={1.8} />
            Settings
          </button>
          <div className="privacy-note">
            <LockKeyhole size={16} />
            <p>Your data is private. Ceregium does not share it with your school.</p>
          </div>
        </div>
      </aside>

      {menuOpen && <button className="scrim" onClick={() => setMenuOpen(false)} aria-label="Close menu" />}

      <main className="main">
        <header className="topbar">
          <button className="menu-button" onClick={() => setMenuOpen(true)} aria-label="Open menu">
            <Menu size={21} />
          </button>
          <p>Local workspace · encrypted SQLite storage</p>
          <button
            className="profile-button"
            aria-label="Sign out"
            onClick={signOut}
          >
            <LogOut size={19} />
          </button>
        </header>
        {actionMessage && (
          <button className="action-message" onClick={() => setActionMessage("")}>
            {actionMessage}<X size={14} />
          </button>
        )}

        {view === "dashboard" && (
          <div className="page dashboard-page">
            <div className="page-heading">
              <div>
                <h1>Today</h1>
                <p>A concise view of what has changed from your usual routine.</p>
              </div>
              <button className="secondary-button" onClick={() => selectView("reflect")}>
                Add reflection
              </button>
            </div>

            <section className="signal-overview">
              <div className="signal-copy">
                <div className="signal-title">
                  <StatusMark status={patternStatus} />
                  <span>AI pattern assessment across recent entries and connected sources</span>
                </div>
                <h2>{patternAssessment.conclusion}</h2>
                <p>
                  Ceregium compares repeated changes in demand and recovery. This is an early
                  warning assessment, not a clinical diagnosis.
                </p>
                <div className="signal-support">
                  <Check size={17} />
                  <span>{patternAssessment.recommendation}</span>
                </div>
                <button className="text-button" onClick={() => selectView("patterns")}>
                  See why <ChevronRight size={16} />
                </button>
              </div>
              <div className="capacity-figure">
                <span className="capacity-number">{patternAssessment.score}</span>
                <span className="capacity-label">pattern strain</span>
                <MatchstickCapacity score={patternAssessment.score} />
              </div>
            </section>

            <div className="dashboard-grid">
              <section className="section-block digest-block">
                <div className="section-title">
                  <h2>Daily digest</h2>
                  <span>Updated from {connected.length} sources</span>
                </div>
                <ol className="digest-list">
                  <li>
                    <span>1</span>
                    <div>
                      <strong>{urgentWorkCount ? "Deadlines need attention." : "No deadline cluster detected."}</strong>
                      <p>
                        {urgentWorkCount
                          ? `${urgentWorkCount} assignments are due or overdue within 48 hours.`
                          : "Your current workload has room for planned recovery."}
                      </p>
                      <p className="digest-balance"><Check size={14} /> {urgentWorkCount ? "Choose the nearest deadline and define its smallest first step." : "Keep one recovery block protected before new work is added."}</p>
                    </div>
                  </li>
                  <li>
                    <span>2</span>
                    <div>
                      <strong>{patternAssessment.score >= 52 ? "Recovery is being displaced." : "Recovery remains within range."}</strong>
                      <p>{patternAssessment.evidence[0] ?? "Add daily reflections to establish a personal baseline."}</p>
                      <p className="digest-balance"><Check size={14} /> {patternAssessment.recommendation}</p>
                    </div>
                  </li>
                  <li>
                    <span>3</span>
                    <div>
                      <strong>{exercises[0].title}</strong>
                      <p>{exercises[0].reason}</p>
                      <p className="digest-balance"><Check size={14} /> Try this {exercises[0].duration} exercise today.</p>
                    </div>
                  </li>
                </ol>
                <div className="digest-action">
                  <Check size={18} />
                  <p>
                    <strong>One manageable action:</strong> {patternAssessment.recommendation}
                  </p>
                </div>
              </section>

              <section className="section-block schedule-block">
                <div className="section-title">
                  <h2>Next 48 hours</h2>
                  <span>{upcomingWork.length} upcoming</span>
                </div>
                <div className="schedule-list">
                  {upcomingWork.length ? upcomingWork.map((item) => (
                    <div key={item.id}>
                      <span className="schedule-time">
                        {new Date(item.dueAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                      </span>
                      <span>{item.title}</span>
                      <span>{new Date(item.dueAt).toLocaleDateString("en-US", { weekday: "short" })}</span>
                    </div>
                  )) : <p className="empty-state">No assignments yet. Add one manually or use the browser companion.</p>}
                </div>
                <button className="text-button" onClick={() => selectView("workload")}>
                  Open workload <ChevronRight size={16} />
                </button>
              </section>
            </div>

            <section className="reflection-prompt">
              <div>
                <NotebookPen size={22} />
                <h2>How did today actually go?</h2>
                <p>
                  A short daily note helps Ceregium notice changes that calendars and apps cannot.
                </p>
              </div>
              <button className="primary-button" onClick={() => selectView("reflect")}>
                Write today&apos;s reflection
              </button>
            </section>

            <section className="exercise-section">
              <div className="section-title">
                <h2>Exercises for today</h2>
                <span>Supportive self-care, not treatment</span>
              </div>
              <div className="exercise-grid">
                {exercises.map((exercise) => (
                  <article key={exercise.id}>
                    <div>
                      <strong>{exercise.title}</strong>
                      <span>{exercise.duration}</span>
                    </div>
                    <p>{exercise.reason}</p>
                    <ol>
                      {exercise.steps.map((step) => <li key={step}>{step}</li>)}
                    </ol>
                  </article>
                ))}
              </div>
            </section>

            {patternAssessment.score >= 52 && schedulePlan && (
              <section className="schedule-plan">
                <div className="section-title">
                  <h2>Possible way to ease the schedule</h2>
                  <span>Advisory 48-hour plan</span>
                </div>
                <p>{schedulePlan.summary}</p>
                <div className="schedule-plan-actions">
                  {schedulePlan.actions.map((action) => (
                    <article key={`${action.kind}-${action.title}`}>
                      <span>{action.kind}</span>
                      <div>
                        <strong>{action.title}</strong>
                        <p>{action.reason}</p>
                        <small>{action.timing}</small>
                      </div>
                    </article>
                  ))}
                </div>
                <p className="plan-guardrail"><ShieldCheck size={16} /> {schedulePlan.guardrail}</p>
              </section>
            )}
          </div>
        )}

        {view === "reflect" && (
          <div className="page narrow-page">
            <div className="page-heading">
              <div>
                <h1>Daily reflection</h1>
                <p>Describe what you did and how it felt. A few sentences are enough.</p>
              </div>
            </div>

            <form className="reflection-form" onSubmit={submitReflection}>
              <label className="textarea-label">
                <span>What did you do today, and how did it feel?</span>
                <textarea
                  value={reflection}
                  onChange={(event) => setReflection(event.target.value)}
                  placeholder="I had classes, finished a project after practice, and felt..."
                  rows={8}
                  maxLength={2000}
                />
                <span className="character-count">{reflection.length}/2000</span>
              </label>

              <div className="ratings-grid">
                <RatingInput
                  label="Energy"
                  value={ratings.energy}
                  onChange={(energy) => setRatings({ ...ratings, energy })}
                  low="drained"
                  high="energized"
                />
                <RatingInput
                  label="Stress"
                  value={ratings.stress}
                  onChange={(stress) => setRatings({ ...ratings, stress })}
                  low="low"
                  high="high"
                />
                <RatingInput
                  label="Sleep"
                  value={ratings.sleep}
                  onChange={(sleep) => setRatings({ ...ratings, sleep })}
                  low="poor"
                  high="restful"
                />
                <RatingInput
                  label="Workload"
                  value={ratings.workload}
                  onChange={(workload) => setRatings({ ...ratings, workload })}
                  low="light"
                  high="heavy"
                />
              </div>

              <label className="consent-row">
                <input
                  type="checkbox"
                  checked={analysisEnabled}
                  onChange={(event) => setAnalysisEnabled(event.target.checked)}
                />
                <span>
                  <strong>Analyze this reflection for patterns</strong>
                  <span>You can keep the journal entry without AI analysis.</span>
                </span>
              </label>

              <div className="form-actions">
                <p>
                  <LockKeyhole size={15} /> Only you can see this entry.
                </p>
                <button className="primary-button" disabled={!reflection.trim() || submitting}>
                  {submitting ? "Reviewing patterns..." : saved ? "Saved" : "Save reflection"}
                </button>
              </div>
            </form>

            {reflections.length > 0 && (
              <section className="history-section">
                <h2>Recent reflections</h2>
                {reflections.slice(0, 3).map((entry) => (
                  <article key={entry.id} className="history-entry">
                    <div>
                      <span>{entry.createdAt}</span>
                      <StatusMark status={entry.analysis.status} />
                    </div>
                    <p>{entry.text}</p>
                    <strong>{entry.analysis.summary}</strong>
                  </article>
                ))}
              </section>
            )}
          </div>
        )}

        {view === "patterns" && (
          <div className="page">
            <div className="page-heading">
              <div>
                <h1>Patterns</h1>
                <p>Repeated changes supported by your reflections and connected sources.</p>
              </div>
            </div>

            <section className="pattern-lead">
              <div>
                <StatusMark status={patternStatus} />
                <h2>{patternAssessment.conclusion}</h2>
                <p>
                  Confidence {Math.round(patternAssessment.confidence * 100)}%. This is a
                  non-clinical pattern assessment, not a medical diagnosis.
                </p>
                <ul className="assessment-evidence">
                  {patternAssessment.evidence.map((item) => <li key={item}>{item}</li>)}
                </ul>
                <div className="assessment-action">
                  <Check size={15} />
                  <span>{patternAssessment.recommendation}</span>
                </div>
              </div>
              <div className="pattern-sources">
                <MatchstickCapacity score={patternAssessment.score} />
                <span><BookOpen size={17} /> Classroom workload</span>
                <span><NotebookPen size={17} /> Daily reflections</span>
                <span><CalendarDays size={17} /> Schedule density</span>
                <span><Activity size={17} /> Aggregate browser activity</span>
              </div>
            </section>

            {activity[0] && (
              <section className="activity-summary">
                <div className="section-title">
                  <h2>Browser activity summary</h2>
                  <span>{activity[0].localDate}</span>
                </div>
                <div>
                  <p><strong>{activity[0].activeMinutes}</strong><span>active minutes</span></p>
                  <p><strong>{activity[0].lateNightMinutes}</strong><span>late-night minutes</span></p>
                  <p><strong>{activity[0].longestSessionMinutes}</strong><span>longest session</span></p>
                  <p><strong>{activity[0].breakCount}</strong><span>meaningful breaks</span></p>
                </div>
                <small>Only aggregate counts are stored. Ceregium does not receive page text, URLs, domains, searches, or messages.</small>
              </section>
            )}

            <section className="section-block">
              <div className="section-title">
                <h2>Recurring themes</h2>
                <span>Across {reflections.length} entries</span>
              </div>
              <div className="theme-table">
                {patternCounts.length ? patternCounts.map(([theme, count]) => (
                  <div key={theme}>
                    <span>{theme}</span>
                    <span>{count} {count === 1 ? "entry" : "entries"}</span>
                    <div><span style={{ width: `${Math.min(100, count * 34)}%` }} /></div>
                    <p><Check size={14} /> {createBalancePairs([theme], latest?.protectiveFactors ?? [])[0].support}</p>
                  </div>
                )) : <p>Write a few daily reflections to establish personal patterns.</p>}
              </div>
            </section>

            <section className="evidence-section">
              <div className="section-title">
                <h2>Evidence</h2>
                <span>Sample data is clearly marked</span>
              </div>
              {reflections.slice(0, 4).map((entry) => (
                <article key={entry.id} className="evidence-row">
                  <span>{entry.createdAt}</span>
                  <div>
                    <strong>{entry.analysis.summary}</strong>
                    <p>{entry.analysis.themes.join(" · ")}</p>
                    <div className="evidence-balances">
                      {(entry.analysis.balances ?? createBalancePairs(
                        entry.analysis.themes,
                        entry.analysis.protectiveFactors,
                      )).map((pair) => (
                        <span key={`${entry.id}-${pair.concern}`}>
                          <Check size={13} /> <strong>{pair.concern}:</strong> {pair.support}
                        </span>
                      ))}
                    </div>
                  </div>
                  <button>Not relevant</button>
                </article>
              ))}
            </section>
          </div>
        )}

        {view === "integrations" && (
          <div className="page">
            <div className="page-heading">
              <div>
                <h1>Integrations</h1>
                <p>Automatically detect assignment metadata without sharing school passwords or OAuth tokens.</p>
              </div>
              <span className="connection-count">{connected.length} connected</span>
            </div>

            <div className="integration-list">
              {allIntegrations.map((integration) => {
                const isConnected = connected.includes(integration.name);
                return (
                  <article key={integration.name} className="integration-row">
                    <div className="integration-icon">{integration.name.charAt(0)}</div>
                    <div>
                      <h2>{integration.name}</h2>
                      <p>{integration.detail}</p>
                    </div>
                    <span>{integration.category}</span>
                    <span className={isConnected ? "connection-state connected" : "connection-state"}>
                      {isConnected ? "Connected" : "Available"}
                    </span>
                  </article>
                );
              })}
            </div>

            <section className="data-policy">
              <ShieldCheck size={22} />
              <div>
                <h2>Browser companion</h2>
                <p>
                  Load the unpacked extension from <code>browser-extension/</code>, create a pairing
                  key below, then paste it into the extension. Once connected, the companion
                  automatically detects assignments on classroom pages and imports them, and reports
                  which learning and productivity services it recognizes. It never sends full URLs,
                  page text, searches, or messages — only assignment metadata, recognized service
                  names, and daily category minutes, late-night use, session length, breaks, and
                  tab-switch counts.
                </p>
              </div>
            </section>
            <section className="browser-pairing">
              <div>
                <h2>Pair this browser</h2>
                <p>Pairing keys can import assignments but cannot read reflections or account data.</p>
              </div>
              {!pairingToken && (
                <button className="primary-button" onClick={createBrowserPairing}>
                  Create pairing key
                </button>
              )}
              {pairingToken && (
                <div className="pairing-token">
                  <label>
                    One-time pairing key
                    <input value={pairingToken} readOnly onFocus={(event) => event.currentTarget.select()} />
                  </label>
                  <p>Store this in the extension now. Ceregium will not show the key again.</p>
                </div>
              )}
              {pairings.map((pairing) => (
                <div className="pairing-row" key={pairing.id}>
                  <div>
                    <strong>{pairing.label}</strong>
                    <span>
                      {pairing.last_used_at
                        ? `Last activity ${new Date(pairing.last_used_at).toLocaleString()}`
                        : "Not used yet"}
                    </span>
                  </div>
                  <button className="secondary-button" onClick={() => revokeBrowserPairing(pairing.id)}>
                    Revoke
                  </button>
                </div>
              ))}
              {activity.length > 0 && (
                <button className="secondary-button" onClick={deleteBrowserActivity}>
                  Delete synced activity
                </button>
              )}
            </section>
          </div>
        )}

        {view === "workload" && (
          <div className="page">
            <div className="page-heading">
              <div>
                <h1>Workload</h1>
                <p>Upcoming schoolwork and calendar commitments in one ordered view.</p>
              </div>
              <div className="heading-actions">
                {workloadStrain && (
                  <span className={`strain-badge strain-${workloadStrain.level}`}>
                    {workloadStrain.level === "light"
                      ? "Light load"
                      : workloadStrain.level === "moderate"
                        ? "Moderate load"
                        : "Heavy load"}
                  </span>
                )}
                <button
                  className="primary-button"
                  onClick={() => setShowWorkloadForm((current) => !current)}
                >
                  {showWorkloadForm ? "Cancel" : "Add assignment"}
                </button>
              </div>
            </div>
            {workloadStrain && workloadStrain.drivers.length > 0 && (
              <p className="strain-drivers">
                Auto-detected workload strain is {workloadStrain.level}: {workloadStrain.drivers.join(", ")}.
              </p>
            )}
            {showWorkloadForm && (
              <form className="manual-workload-form" onSubmit={addManualWorkload}>
                <label>
                  Assignment
                  <input
                    value={manualTitle}
                    onChange={(event) => setManualTitle(event.target.value)}
                    maxLength={160}
                    required
                  />
                </label>
                <label>
                  Course
                  <input
                    value={manualCourse}
                    onChange={(event) => setManualCourse(event.target.value)}
                    maxLength={120}
                  />
                </label>
                <label>
                  Due
                  <input
                    type="datetime-local"
                    value={manualDueAt}
                    onChange={(event) => setManualDueAt(event.target.value)}
                    required
                  />
                </label>
                <label>
                  Points
                  <input
                    type="number"
                    min="0"
                    max="100000"
                    value={manualPoints}
                    onChange={(event) => setManualPoints(event.target.value)}
                  />
                </label>
                <label>
                  Grade impact
                  <select
                    value={manualImpact}
                    onChange={(event) =>
                      setManualImpact(
                        event.target.value as NonNullable<WorkloadItem["gradeImpact"]>,
                      )
                    }
                  >
                    <option value="unknown">Unknown</option>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </label>
                <button className="primary-button">Save assignment</button>
              </form>
            )}
            <section className="workload-list">
              {workload.map((item) => (
                <article key={item.id}>
                  <div>
                    <div className="workload-title">
                      <strong>{item.title}</strong>
                      {item.source === "Manual" && (
                        <button
                          type="button"
                          onClick={() => deleteManualWorkload(item)}
                          aria-label={`Delete ${item.title}`}
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                    <p>
                      {item.course ?? item.source}
                      {item.pointsPossible !== undefined ? ` · ${item.pointsPossible} points` : ""}
                    </p>
                  </div>
                  <span>{new Intl.DateTimeFormat("en-US", {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  }).format(new Date(item.dueAt))}</span>
                  <label className="impact-select">
                    <span>Grade impact</span>
                    <select
                      value={item.gradeImpact ?? "unknown"}
                      onChange={(event) =>
                        updateGradeImpact(
                          item,
                          event.target.value as NonNullable<WorkloadItem["gradeImpact"]>,
                        )
                      }
                    >
                      <option value="unknown">Unknown</option>
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                    </select>
                  </label>
                  <p className="workload-support">
                    <Check size={14} /> {workloadSupport(item, workloadStrain?.score ?? patternAssessment.score)}
                  </p>
                </article>
              ))}
            </section>
          </div>
        )}

        {view === "safety" && (
          <div className="page narrow-page">
            <div className="page-heading">
              <div>
                <h1>Safety plan</h1>
                <p>Keep a trusted person easy to find when you decide you need support.</p>
              </div>
            </div>

            <section className="safety-card">
              <HeartHandshake size={28} />
              <h2>Trusted contact</h2>
              <p>
                This contact is encrypted and stored only in your local Ceregium database.
                Ceregium will never contact them automatically.
              </p>
              <label>
                Contact email or phone
                <input
                  value={trustedContact}
                  onChange={(event) => setTrustedContact(event.target.value)}
                  placeholder="someone you trust"
                />
              </label>
              <label className="consent-row">
                <input
                  type="checkbox"
                  checked={safetyActive}
                  onChange={(event) => setSafetyActive(event.target.checked)}
                />
                <span>
                  <strong>Add this person to my local plan</strong>
                  <span>You decide if and when to contact them.</span>
                </span>
              </label>
              <div className="shared-preview">
                <strong>Suggested message</strong>
                <p>
                  “Ceregium noticed repeated changes in workload, sleep, and daily reflections.
                  Could you check in with me?” Your journal text is never included.
                </p>
              </div>
              {!verificationId && (
                <button
                  className="primary-button"
                  disabled={!trustedContact || !safetyActive}
                  onClick={requestVerification}
                >
                  Save contact locally
                </button>
              )}
              {verificationId && !contactVerified && (
                <div className="verification-block">
                  <label>
                    Verification code
                    <input
                      inputMode="numeric"
                      value={verificationCode}
                      onChange={(event) => setVerificationCode(event.target.value)}
                      placeholder="6-digit code"
                    />
                  </label>
                  {verificationPreview && <p>Local confirmation code: <strong>{verificationPreview}</strong></p>}
                  <button className="primary-button" onClick={confirmVerification} disabled={verificationCode.toUpperCase() !== "LOCAL"}>
                    Confirm local plan
                  </button>
                </div>
              )}
              {contactVerified && (
                <button className="secondary-button" onClick={sendTestNotification}>
                  Test local plan
                </button>
              )}
              {safetyMessage && <p className="form-message">{safetyMessage}</p>}
            </section>

            <section className="crisis-note">
              <MessageCircleMore size={20} />
              <p>
                Ceregium is not an emergency service. If you or someone else is in immediate
                danger, call 911. In the U.S., call or text 988 for the Suicide &amp; Crisis
                Lifeline.
              </p>
            </section>
          </div>
        )}

        {view === "privacy" && (
          <div className="page narrow-page">
            <div className="page-heading">
              <div>
                <h1>Privacy</h1>
                <p>Control storage, analysis, exports, and deletion from one place.</p>
              </div>
            </div>
            <section className="privacy-list">
              {[
                ["Reflection analysis", "Enabled", "AI identifies themes in entries you choose to analyze."],
                ["Storage", "Local SQLite", "Your account data is stored on this Ceregium server."],
                ["Browser imports", "Metadata only", "Only assignments you review and approve are imported."],
                ["School access", "None", "Your school cannot view your dashboard or reflections."],
              ].map(([title, value, description]) => (
                <div key={title}>
                  <div><strong>{title}</strong><span>{value}</span></div>
                  <p>{description}</p>
                </div>
              ))}
            </section>
            <div className="privacy-actions">
              <button className="secondary-button" onClick={exportData}><Download size={16} /> Export my data</button>
              <button className="danger-button" onClick={deleteAccount}><Trash2 size={16} /> Delete my account</button>
            </div>
          </div>
        )}

        {view === "settings" && (
          <div className="page narrow-page">
            <div className="page-heading">
              <div>
                <h1>Settings</h1>
                <p>Control daily analysis, digest timing, time zone, and motion preferences.</p>
              </div>
            </div>
            <section className="settings-form">
              <label>
                Time zone
                <select value={settings.timezone} onChange={(event) => setSettings({ ...settings, timezone: event.target.value })}>
                  <option value="America/Los_Angeles">Pacific Time</option>
                  <option value="America/Denver">Mountain Time</option>
                  <option value="America/Chicago">Central Time</option>
                  <option value="America/New_York">Eastern Time</option>
                </select>
              </label>
              <label>
                Digest time
                <select value={settings.digestHour} onChange={(event) => setSettings({ ...settings, digestHour: Number(event.target.value) })}>
                  {[6, 7, 8, 9, 16, 17, 18, 19].map((hour) => (
                    <option key={hour} value={hour}>{new Date(2020, 0, 1, hour).toLocaleTimeString("en-US", { hour: "numeric" })}</option>
                  ))}
                </select>
              </label>
              <label className="consent-row">
                <input type="checkbox" checked={settings.analysisEnabled} onChange={(event) => {
                  setSettings({ ...settings, analysisEnabled: event.target.checked });
                  setAnalysisEnabled(event.target.checked);
                }} />
                <span><strong>Reflection analysis</strong><span>Identify non-diagnostic patterns in entries you choose to analyze.</span></span>
              </label>
              <label className="consent-row">
                <input type="checkbox" checked={settings.digestEnabled} onChange={(event) => setSettings({ ...settings, digestEnabled: event.target.checked })} />
                <span><strong>Daily digest</strong><span>Prepare one concise in-app summary each day.</span></span>
              </label>
              <label className="consent-row">
                <input type="checkbox" checked={settings.reducedMotion} onChange={(event) => setSettings({ ...settings, reducedMotion: event.target.checked })} />
                <span><strong>Reduce motion</strong><span>Minimize smooth scrolling and interface transitions.</span></span>
              </label>
              <button className="primary-button" onClick={saveSettings}>Save settings</button>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
