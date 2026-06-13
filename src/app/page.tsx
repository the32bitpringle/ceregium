"use client";

import {
  Activity,
  BookOpen,
  CalendarDays,
  Check,
  ChevronRight,
  CircleUserRound,
  Download,
  HeartHandshake,
  LayoutDashboard,
  Link2,
  LockKeyhole,
  LogOut,
  Menu,
  MessageCircleMore,
  NotebookPen,
  RefreshCw,
  Settings,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { createBrowserSupabase } from "@/lib/supabase";
import { createBalancePairs, workloadSupport } from "@/lib/balancing";
import { assessBurnoutPattern } from "@/lib/burnout-assessment";
import type {
  AppSettings,
  AnalysisResult,
  Integration,
  Reflection,
  ReflectionRatings,
  View,
  WorkloadItem,
} from "@/lib/types";

const integrations: Integration[] = [
  { name: "Google Classroom", category: "School", status: "connected", detail: "Assignments and due dates" },
  { name: "Google Calendar", category: "Schedule", status: "connected", detail: "Event timing and density" },
  { name: "Notion", category: "Planning", status: "available", detail: "Pages you explicitly select" },
  { name: "Discord", category: "Social", status: "available", detail: "Approved servers and activity" },
  { name: "Instagram", category: "Social", status: "limited", detail: "Professional accounts only" },
  { name: "X", category: "Social", status: "available", detail: "Posts and DMs with approved access" },
  { name: "Slack", category: "Communication", status: "available", detail: "Approved workspace channels" },
  { name: "Canvas", category: "School", status: "available", detail: "Coursework and calendar" },
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

const sampleReflections: Reflection[] = [
  {
    id: "sample-1",
    createdAt: "Sample: Monday",
    text: "Finished two assignments after practice and went to sleep later than planned.",
    ratings: { energy: 2, stress: 4, sleep: 2, workload: 4 },
    analysis: {
      status: "watch",
      score: 62,
      summary: "Less recovery time than your usual routine.",
      themes: ["late work", "high workload", "reduced sleep"],
      protectiveFactors: ["physical activity"],
      balances: createBalancePairs(["late work", "high workload", "reduced sleep"], ["physical activity"]),
      confidence: 0.78,
    },
  },
  {
    id: "sample-2",
    createdAt: "Sample: Tuesday",
    text: "Had a quiz, club meeting, and homework. I skipped my usual break to catch up.",
    ratings: { energy: 2, stress: 4, sleep: 3, workload: 5 },
    analysis: {
      status: "elevated",
      score: 73,
      summary: "Workload is repeatedly displacing recovery time.",
      themes: ["schedule compression", "missed breaks", "high workload"],
      protectiveFactors: ["social connection"],
      balances: createBalancePairs(["schedule compression", "missed breaks", "high workload"], ["social connection"]),
      confidence: 0.84,
    },
  },
];

const sampleWorkload: WorkloadItem[] = [
  {
    id: "sample-history",
    title: "History response",
    source: "Google Classroom",
    course: "U.S. History",
    dueAt: new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString(),
    status: "upcoming",
    pointsPossible: 5,
    gradeImpact: "low",
  },
  {
    id: "sample-physics",
    title: "Physics quiz",
    source: "Google Calendar",
    course: "Physics",
    dueAt: new Date(Date.now() + 28 * 60 * 60 * 1000).toISOString(),
    status: "upcoming",
    pointsPossible: 40,
    gradeImpact: "high",
  },
  {
    id: "sample-essay",
    title: "Literature essay draft",
    source: "Google Classroom",
    course: "English",
    dueAt: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
    status: "upcoming",
    pointsPossible: 20,
    gradeImpact: "medium",
  },
];

const defaultSettings: AppSettings = {
  timezone: "America/Los_Angeles",
  reducedMotion: false,
  digestEnabled: true,
  digestHour: 7,
  analysisEnabled: true,
};

interface RuntimeConfig {
  mode: "demo" | "configured";
  services: {
    supabase: boolean;
    google: boolean;
    openai: boolean;
    email: boolean;
    sms: boolean;
  };
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

function AuthPanel({
  supabase,
  onSession,
}: {
  supabase: SupabaseClient;
  onSession: (session: Session) => void;
}) {
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
    if (mode === "signup") {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) setMessage(error.message);
      else if (data.session) {
        const response = await fetch("/api/profile", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${data.session.access_token}`,
          },
          body: JSON.stringify({ dateOfBirth, displayName }),
        });
        const result = await response.json();
        if (!response.ok) setMessage(result.error);
        else onSession(data.session);
      } else {
        setMessage("Check your email to confirm your account, then sign in.");
      }
    } else {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setMessage(error.message);
      else if (data.session) onSession(data.session);
    }
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
            <input type="password" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} required />
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

function ProfileSetup({
  session,
  onComplete,
}: {
  session: Session;
  onComplete: () => void;
}) {
  const [displayName, setDisplayName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    const response = await fetch("/api/profile", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ displayName, dateOfBirth }),
    });
    const result = await response.json();
    if (!response.ok) setMessage(result.error);
    else onComplete();
  }

  return (
    <main className="auth-page">
      <section className="auth-panel">
        <div className="brand auth-brand">
          <div className="brand-symbol" aria-hidden="true"><span /><span /></div>
          <span>Ceregium</span>
        </div>
        <div className="auth-copy">
          <h1>Complete your profile</h1>
          <p>This age check is required before Ceregium can store wellbeing data.</p>
        </div>
        <form onSubmit={submit}>
          <label>Name<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} required /></label>
          <label>Date of birth<input type="date" value={dateOfBirth} onChange={(event) => setDateOfBirth(event.target.value)} required /></label>
          {message && <p className="form-message">{message}</p>}
          <button className="primary-button">Continue</button>
        </form>
      </section>
    </main>
  );
}

export default function Home() {
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const [runtime, setRuntime] = useState<RuntimeConfig | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [profileReady, setProfileReady] = useState(false);
  const [needsProfile, setNeedsProfile] = useState(false);
  const [view, setView] = useState<View>("dashboard");
  const [menuOpen, setMenuOpen] = useState(false);
  const [reflection, setReflection] = useState("");
  const [ratings, setRatings] = useState(defaultRatings);
  const [reflections, setReflections] = useState<Reflection[]>(sampleReflections);
  const [connected, setConnected] = useState<string[]>(["Google Classroom", "Google Calendar"]);
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
  const [workload, setWorkload] = useState<WorkloadItem[]>(sampleWorkload);
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [actionMessage, setActionMessage] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/config")
      .then((response) => response.json())
      .then((config: RuntimeConfig) => {
        if (!active) return;
        setRuntime(config);
        if (config.mode === "demo" || !supabase) {
          const stored = window.localStorage.getItem("ceregium-reflections");
          const storedConnections = window.localStorage.getItem("ceregium-connections");
          const storedSettings = window.localStorage.getItem("ceregium-settings");
          if (stored) setReflections(JSON.parse(stored));
          if (storedConnections) setConnected(JSON.parse(storedConnections));
          if (storedSettings) setSettings(JSON.parse(storedSettings));
          setAuthReady(true);
        }
      });
    return () => { active = false; };
  }, [supabase]);

  useEffect(() => {
    if (!supabase || runtime?.mode !== "configured") return;
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setAuthReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setAuthReady(true);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [runtime?.mode, supabase]);

  useEffect(() => {
    if (runtime?.mode !== "configured" || !session) return;
    const headers = { Authorization: `Bearer ${session.access_token}` };
    Promise.all([
      fetch("/api/profile", { headers }).then((response) => response.json()),
      fetch("/api/reflections", { headers }).then((response) => response.json()),
      fetch("/api/integrations/status", { headers }).then((response) => response.json()),
      fetch("/api/workload", { headers }).then((response) => response.json()),
      fetch("/api/settings", { headers }).then((response) => response.json()),
    ]).then(([profileData, reflectionData, integrationData, workloadData, settingsData]) => {
      setNeedsProfile(!profileData.profile);
      setProfileReady(true);
      if (reflectionData.reflections?.length) setReflections(reflectionData.reflections);
      if (integrationData.providers?.some((item: { provider: string }) => item.provider === "google")) {
        setConnected(["Google Classroom", "Google Calendar"]);
      }
      if (workloadData.items?.length) setWorkload(workloadData.items);
      if (settingsData.settings) setSettings(settingsData.settings);
    });
  }, [runtime?.mode, session]);

  const authHeaders = useMemo<Record<string, string>>(
    (): Record<string, string> =>
      session ? { Authorization: `Bearer ${session.access_token}` } : {},
    [session],
  );

  const latest = reflections[0]?.analysis;
  const patternAssessment = useMemo(
    () => assessBurnoutPattern(reflections, workload),
    [reflections, workload],
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

  async function submitReflection(event: FormEvent) {
    event.preventDefault();
    if (!reflection.trim()) return;
    setSubmitting(true);

    const configured = runtime?.mode === "configured" && session;
    const response = await fetch(configured ? "/api/reflections" : "/api/reflections/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders },
      body: JSON.stringify({ text: reflection, ratings, analysisEnabled }),
    });
    const result = await response.json();
    if (!response.ok) {
      setActionMessage(result.error ?? "Could not save reflection");
      setSubmitting(false);
      return;
    }
    const analysis: AnalysisResult = configured ? result.reflection.analysis : result;
    const entry: Reflection = configured ? result.reflection : {
        id: crypto.randomUUID(),
        createdAt: new Intl.DateTimeFormat("en-US", {
          weekday: "long",
          month: "short",
          day: "numeric",
        }).format(new Date()),
        text: reflection.trim(),
        ratings,
        analysis,
      };
    const next = [entry, ...reflections.filter((item) => !item.id.startsWith("sample-"))];
    setReflections(next);
    if (!configured) window.localStorage.setItem("ceregium-reflections", JSON.stringify(next));
    setReflection("");
    setRatings(defaultRatings);
    setSubmitting(false);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2500);
  }

  function toggleConnection(name: string) {
    const next = connected.includes(name)
      ? connected.filter((item) => item !== name)
      : [...connected, name];
    setConnected(next);
    window.localStorage.setItem("ceregium-connections", JSON.stringify(next));
  }

  async function connectIntegration(name: string) {
    if (
      runtime?.mode === "configured" &&
      (name === "Google Classroom" || name === "Google Calendar")
    ) {
      const response = await fetch("/api/integrations/google/authorize", { headers: authHeaders });
      const result = await response.json();
      if (!response.ok) {
        setActionMessage(result.error);
        return;
      }
      window.location.assign(result.url);
      return;
    }
    toggleConnection(name);
  }

  async function syncGoogle() {
    const response = await fetch("/api/integrations/google/sync", {
      method: "POST",
      headers: authHeaders,
    });
    const result = await response.json();
    if (!response.ok) setActionMessage(result.error);
    else {
      setActionMessage(`Synced ${result.synced} Google items.`);
      const workloadResponse = await fetch("/api/workload", { headers: authHeaders });
      const workloadResult = await workloadResponse.json();
      if (workloadResult.items) setWorkload(workloadResult.items);
    }
  }

  async function updateGradeImpact(
    item: WorkloadItem,
    gradeImpact: NonNullable<WorkloadItem["gradeImpact"]>,
  ) {
    setWorkload((current) =>
      current.map((candidate) =>
        candidate.id === item.id ? { ...candidate, gradeImpact } : candidate,
      ),
    );
    if (runtime?.mode !== "configured") return;
    const response = await fetch("/api/workload", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeaders },
      body: JSON.stringify({ id: item.id, gradeImpact }),
    });
    if (!response.ok) {
      const result = await response.json();
      setActionMessage(result.error ?? "Could not update grade impact.");
    }
  }

  async function requestVerification() {
    setSafetyMessage("");
    const response = await fetch("/api/safety-plan/request-verification", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders },
      body: JSON.stringify({ destination: trustedContact }),
    });
    const result = await response.json();
    if (!response.ok) return setSafetyMessage(result.error);
    setVerificationId(result.verificationId);
    setVerificationPreview(result.previewCode ?? "");
    setSafetyMessage(result.delivered ? "Verification code sent." : "Delivery provider is not configured; use the development code.");
  }

  async function confirmVerification() {
    const response = await fetch("/api/safety-plan/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders },
      body: JSON.stringify({ verificationId, code: verificationCode, active: safetyActive }),
    });
    const result = await response.json();
    if (!response.ok) return setSafetyMessage(result.error);
    setContactVerified(true);
    setSafetyMessage("Trusted contact verified.");
  }

  async function sendTestNotification() {
    const response = await fetch("/api/safety-plan/test", { method: "POST", headers: authHeaders });
    const result = await response.json();
    setSafetyMessage(
      result.delivered ? "Test notification delivered." : "Test completed in preview mode.",
    );
  }

  async function saveSettings() {
    if (runtime?.mode === "demo") {
      window.localStorage.setItem("ceregium-settings", JSON.stringify(settings));
      setActionMessage("Settings saved locally.");
      return;
    }
    const response = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeaders },
      body: JSON.stringify(settings),
    });
    const result = await response.json();
    setActionMessage(response.ok ? "Settings saved." : result.error);
  }

  async function exportData() {
    let data: unknown;
    if (runtime?.mode === "configured") {
      const response = await fetch("/api/privacy/export", { headers: authHeaders });
      data = await response.json();
    } else {
      data = { exportedAt: new Date().toISOString(), reflections, connected, workload, settings };
    }
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
    if (runtime?.mode === "configured") {
      const response = await fetch("/api/privacy/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ confirmation }),
      });
      if (!response.ok) {
        const result = await response.json();
        return setActionMessage(result.error);
      }
      await supabase?.auth.signOut();
    } else {
      window.localStorage.removeItem("ceregium-reflections");
      window.localStorage.removeItem("ceregium-connections");
      window.localStorage.removeItem("ceregium-settings");
      setReflections(sampleReflections);
      setConnected(["Google Classroom", "Google Calendar"]);
      setSettings(defaultSettings);
    }
    setActionMessage("Account data deleted.");
  }

  function selectView(next: View) {
    setView(next);
    setMenuOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (!runtime || !authReady) {
    return <main className="loading-page">Loading Ceregium...</main>;
  }

  if (runtime.mode === "configured" && supabase && !session) {
    return <AuthPanel supabase={supabase} onSession={setSession} />;
  }

  if (runtime.mode === "configured" && session && (!profileReady || needsProfile)) {
    if (!profileReady) return <main className="loading-page">Loading your private workspace...</main>;
    return (
      <ProfileSetup
        session={session}
        onComplete={() => {
          setNeedsProfile(false);
          setProfileReady(true);
        }}
      />
    );
  }

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
          <p>{runtime.mode === "demo" ? "Demo workspace · data stays in this browser" : "Private student workspace"}</p>
          <button
            className="profile-button"
            aria-label={session ? "Sign out" : "Profile"}
            onClick={() => session && supabase?.auth.signOut()}
          >
            {session ? <LogOut size={19} /> : <CircleUserRound size={21} />}
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
                      <strong>Deadlines are clustering.</strong>
                      <p>Three sample assignments fall within the next four days.</p>
                      <p className="digest-balance"><Check size={14} /> Choose the nearest deadline and define its smallest first step.</p>
                    </div>
                  </li>
                  <li>
                    <span>2</span>
                    <div>
                      <strong>Recovery time appears lower.</strong>
                      <p>Recent sample reflections mention late work and missed breaks.</p>
                      <p className="digest-balance"><Check size={14} /> Protect one 20-minute break before beginning the next task.</p>
                    </div>
                  </li>
                  <li>
                    <span>3</span>
                    <div>
                      <strong>Practice remains a useful reset.</strong>
                      <p>Physical activity appears alongside better mood language.</p>
                      <p className="digest-balance"><Check size={14} /> Keep this supportive routine protected when workload rises.</p>
                    </div>
                  </li>
                </ol>
                <div className="digest-action">
                  <Check size={18} />
                  <p>
                    <strong>One manageable action:</strong> protect a 20-minute break before
                    starting tonight&apos;s second assignment.
                  </p>
                </div>
              </section>

              <section className="section-block schedule-block">
                <div className="section-title">
                  <h2>Next 48 hours</h2>
                  <span>Sample schedule</span>
                </div>
                <div className="schedule-list">
                  <div>
                    <span className="schedule-time">4:00</span>
                    <span>Practice</span>
                    <span>Today</span>
                  </div>
                  <div>
                    <span className="schedule-time">11:59</span>
                    <span>History response</span>
                    <span>Today</span>
                  </div>
                  <div>
                    <span className="schedule-time">8:30</span>
                    <span>Physics quiz</span>
                    <span>Tomorrow</span>
                  </div>
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
              </div>
            </section>

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
                <p>Choose each source and the exact data Ceregium may process.</p>
              </div>
              <span className="connection-count">{connected.length} connected</span>
            </div>

            <div className="integration-list">
              {integrations.map((integration) => {
                const isConnected = connected.includes(integration.name);
                return (
                  <article key={integration.name} className="integration-row">
                    <div className="integration-icon">{integration.name.charAt(0)}</div>
                    <div>
                      <h2>{integration.name}</h2>
                      <p>{integration.detail}</p>
                    </div>
                    <span>{integration.category}</span>
                    {integration.status === "limited" ? (
                      <button className="secondary-button" disabled>Limited API</button>
                    ) : (
                      <button
                        className={isConnected ? "connected-button" : "secondary-button"}
                        onClick={() => connectIntegration(integration.name)}
                      >
                        {isConnected ? <><Check size={16} /> Connected</> : "Connect"}
                      </button>
                    )}
                  </article>
                );
              })}
            </div>

            <section className="data-policy">
              <ShieldCheck size={22} />
              <div>
                <h2>Granular consent by default</h2>
                <p>
                  Connecting an account does not grant unrestricted access. Content analysis is
                  separate from activity metadata, and either permission can be revoked.
                </p>
              </div>
            </section>
            {runtime.services.google && connected.includes("Google Classroom") && (
              <button className="secondary-button sync-button" onClick={syncGoogle}>
                <RefreshCw size={16} /> Sync Google now
              </button>
            )}
          </div>
        )}

        {view === "workload" && (
          <div className="page">
            <div className="page-heading">
              <div>
                <h1>Workload</h1>
                <p>Upcoming schoolwork and calendar commitments in one ordered view.</p>
              </div>
              {runtime.services.google && (
                <button className="secondary-button" onClick={syncGoogle}>
                  <RefreshCw size={16} /> Sync Google
                </button>
              )}
            </div>
            <section className="workload-list">
              {workload.map((item) => (
                <article key={item.id}>
                  <div>
                    <strong>{item.title}</strong>
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
                    <Check size={14} /> {workloadSupport(item, patternAssessment.score)}
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
                <p>Choose one person Ceregium may contact only under your preauthorized rules.</p>
              </div>
            </div>

            <section className="safety-card">
              <HeartHandshake size={28} />
              <h2>Trusted contact</h2>
              <p>
                Normal and elevated signals remain private. A verified contact can receive a
                limited summary only after repeated critical signals and active consent.
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
                  <strong>Authorize critical alerts</strong>
                  <span>You can pause or revoke this at any time.</span>
                </span>
              </label>
              <div className="shared-preview">
                <strong>What would be shared</strong>
                <p>
                  “Ceregium noticed repeated changes in workload, sleep, and daily reflections.
                  Please check in directly.” No journal text or private messages are included.
                </p>
              </div>
              {!verificationId && (
                <button
                  className="primary-button"
                  disabled={!trustedContact || !safetyActive}
                  onClick={requestVerification}
                >
                  Send verification code
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
                  {verificationPreview && <p>Development code: <strong>{verificationPreview}</strong></p>}
                  <button className="primary-button" onClick={confirmVerification} disabled={verificationCode.length !== 6}>
                    Confirm contact
                  </button>
                </div>
              )}
              {contactVerified && (
                <button className="secondary-button" onClick={sendTestNotification}>
                  Send test notification
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
                ["Raw connected content", "7 days", "Temporary content is deleted after features are derived."],
                ["Derived patterns", "180 days", "Used to compare recent activity with your personal baseline."],
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
