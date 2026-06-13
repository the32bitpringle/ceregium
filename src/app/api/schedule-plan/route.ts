import { createHash, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { mapActivityDay } from "@/lib/activity";
import { assessBurnoutPattern } from "@/lib/burnout-assessment";
import { db, jsonParse } from "@/lib/db";
import { currentUser } from "@/lib/local-auth";
import { rateLimit, rateLimited, rejectCrossSite } from "@/lib/api-security";
import { createScheduleEasePlan } from "@/lib/schedule-planner";
import type {
  AnalysisResult,
  AppSettings,
  Reflection,
  ScheduleEasePlan,
  WorkloadItem,
} from "@/lib/types";

function mapWorkload(row: Record<string, unknown>): WorkloadItem {
  return {
    id: String(row.id),
    title: String(row.title),
    source: String(row.source),
    course: row.course ? String(row.course) : undefined,
    dueAt: String(row.due_at),
    status: String(row.status) as WorkloadItem["status"],
    pointsPossible: row.points_possible === null ? undefined : Number(row.points_possible),
    gradeImpact: String(row.grade_impact || "unknown") as WorkloadItem["gradeImpact"],
  };
}

export async function POST(request: Request) {
  const rejected = rejectCrossSite(request);
  if (rejected) return rejected;
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limit = await rateLimit(`schedule-plan:${user.id}`, 12, 60 * 60 * 1000);
  if (!limit.allowed) return rateLimited(limit.retryAfter);

  const reflectionRows = db.prepare(`
    select id,local_date,energy,stress,sleep,workload,analysis_json
    from reflections where user_id=? order by local_date desc limit 7
  `).all(user.id) as Array<Record<string, unknown>>;
  const reflections: Reflection[] = reflectionRows.map((row) => ({
    id: String(row.id),
    createdAt: String(row.local_date),
    text: "",
    ratings: {
      energy: Number(row.energy),
      stress: Number(row.stress),
      sleep: Number(row.sleep),
      workload: Number(row.workload),
    },
    analysis: jsonParse<AnalysisResult>(String(row.analysis_json), {
      status: "steady",
      score: 0,
      summary: "",
      themes: [],
      protectiveFactors: [],
      balances: [],
      confidence: 0,
    }),
  }));
  const workloadRows = db.prepare(`
    select * from workload_items where user_id=? order by due_at asc limit 100
  `).all(user.id) as Array<Record<string, unknown>>;
  const workload = workloadRows.map(mapWorkload);
  const activityRows = db.prepare(`
    select * from browser_activity_daily where user_id=? order by local_date desc limit 7
  `).all(user.id) as Array<Record<string, unknown>>;
  const activity = activityRows.map(mapActivityDay);
  const assessment = assessBurnoutPattern(reflections, workload, activity);
  if (assessment.score < 52) {
    return NextResponse.json(
      { error: "A schedule-easing plan is not needed for the current pattern." },
      { status: 409 },
    );
  }

  const fingerprint = createHash("sha256").update(JSON.stringify({
    score: assessment.score,
    reflectionIds: reflections.map((entry) => entry.id),
    activity: activity.map((day) => [day.localDate, day.activeMinutes, day.lateNightMinutes]),
    workload: workload.map((item) => [item.id, item.dueAt, item.status, item.gradeImpact]),
  })).digest("hex");
  const cached = db.prepare(`
    select id,plan_json,created_at from schedule_plans where user_id=? and fingerprint=?
  `).get(user.id, fingerprint) as
    | { id: string; plan_json: string; created_at: string }
    | undefined;
  if (cached) {
    return NextResponse.json({
      plan: {
        ...jsonParse<ScheduleEasePlan>(cached.plan_json, {
          summary: "",
          actions: [],
          guardrail: "",
          model: "deterministic-fallback",
        }),
        id: cached.id,
        createdAt: cached.created_at,
      },
    });
  }

  const settingsRow = db.prepare("select settings_json from users where id=?").get(user.id) as
    | { settings_json: string }
    | undefined;
  const settings = jsonParse<Partial<AppSettings>>(settingsRow?.settings_json, {});
  const plan = await createScheduleEasePlan(
    assessment,
    workload,
    activity,
    settings.analysisEnabled !== false,
  );
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  db.prepare(`
    insert into schedule_plans(id,user_id,fingerprint,assessment_score,plan_json,created_at)
    values(?,?,?,?,?,?)
  `).run(id, user.id, fingerprint, assessment.score, JSON.stringify(plan), createdAt);
  return NextResponse.json({ plan: { ...plan, id, createdAt } });
}
