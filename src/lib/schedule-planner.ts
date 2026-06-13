import "server-only";

import { z } from "zod";
import type {
  BrowserActivityDay,
  PatternAssessment,
  ScheduleEasePlan,
  SchedulePlanAction,
  WorkloadItem,
} from "@/lib/types";

const planSchema = z.object({
  summary: z.string().min(1).max(240),
  actions: z.array(z.object({
    title: z.string().min(1).max(100),
    reason: z.string().min(1).max(220),
    timing: z.string().min(1).max(100),
    assignmentId: z.string().optional(),
    kind: z.enum(["protect", "reduce", "move", "ask", "recover"]),
  })).min(3).max(6),
  guardrail: z.string().min(1).max(240),
});

function deterministicPlan(
  assessment: PatternAssessment,
  workload: WorkloadItem[],
  activity: BrowserActivityDay[],
): ScheduleEasePlan {
  const upcoming = workload
    .filter((item) => item.status !== "submitted")
    .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime());
  const highImpact = upcoming.find((item) => item.gradeImpact === "high");
  const lowImpact = upcoming.find((item) => item.gradeImpact === "low");
  const nearest = upcoming[0];
  const actions: SchedulePlanAction[] = [];

  if (highImpact) {
    actions.push({
      title: `Protect a focused block for ${highImpact.title}`,
      reason: "This is marked high impact, so reducing lower-value work is safer than squeezing this into late-night time.",
      timing: "Use one 30-45 minute block before the next optional task.",
      assignmentId: highImpact.id,
      kind: "protect",
    });
  } else if (nearest) {
    actions.push({
      title: `Define “good enough” for ${nearest.title}`,
      reason: "A smaller clear finish line reduces perfection-driven schedule expansion.",
      timing: "Before starting the next work block.",
      assignmentId: nearest.id,
      kind: "protect",
    });
  }
  if (lowImpact) {
    actions.push({
      title: `Reduce effort on ${lowImpact.title}`,
      reason: "You marked this low impact. Consider a minimal submission, an extension request, or missing it only after checking the grading and late-work policy.",
      timing: "Decide before spending another full work block on it.",
      assignmentId: lowImpact.id,
      kind: "reduce",
    });
  } else {
    actions.push({
      title: "Move one optional commitment",
      reason: "No assignment is marked low impact, so choose optional polish or a non-required task instead of guessing what can be skipped.",
      timing: "Move it outside the next 48 hours.",
      kind: "move",
    });
  }
  if (activity.some((day) => day.lateNightMinutes >= 45)) {
    actions.push({
      title: "Set a hard stopping time tonight",
      reason: "Recent browser summaries show late-night activity, which can reduce recovery and make tomorrow’s workload harder.",
      timing: "Stop schoolwork at least 30 minutes before your intended sleep time.",
      kind: "recover",
    });
  } else {
    actions.push({
      title: "Protect one screen-free recovery block",
      reason: "A real break creates capacity without requiring another productivity task.",
      timing: "Take 15 minutes between the next two commitments.",
      kind: "recover",
    });
  }
  actions.push({
    title: "Ask early if a deadline is unrealistic",
    reason: "A short extension request is usually more useful before a deadline than after capacity is exhausted.",
    timing: "Send the request today if the current plan still exceeds available time.",
    kind: "ask",
  });

  return {
    summary: `A possible way to lower the next 48 hours of demand while protecting higher-impact work. Current pattern strain is ${assessment.score}/100.`,
    actions: actions.slice(0, 5),
    guardrail: "Check syllabi, late-work rules, and family or school expectations before skipping or moving required work. Ceregium does not make academic decisions for you.",
    model: "deterministic-fallback",
  };
}

export async function createScheduleEasePlan(
  assessment: PatternAssessment,
  workload: WorkloadItem[],
  activity: BrowserActivityDay[],
  analysisEnabled: boolean,
): Promise<ScheduleEasePlan> {
  const fallback = deterministicPlan(assessment, workload, activity);
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey || !analysisEnabled) return fallback;

  try {
    const model = process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini";
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.APP_URL || "http://localhost:3000",
        "X-Title": "Ceregium",
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: [
              "Create a non-clinical, practical 48-hour schedule-easing plan for a student showing possible burnout patterns.",
              "Return JSON with summary, actions, and guardrail.",
              "Each action needs title, reason, timing, optional assignmentId, and kind: protect, reduce, move, ask, or recover.",
              "Never tell the student to skip high-impact work.",
              "Only suggest minimizing or possibly missing work explicitly marked low impact, and require checking grading and late-work policy.",
              "Do not alter deadlines or claim certainty. Include recovery and asking for help.",
            ].join(" "),
          },
          {
            role: "user",
            content: JSON.stringify({
              assessment,
              workload: workload.map((item) => ({
                id: item.id,
                title: item.title,
                course: item.course,
                dueAt: item.dueAt,
                status: item.status,
                gradeImpact: item.gradeImpact,
                pointsPossible: item.pointsPossible,
              })),
              activity: activity.slice(0, 7),
            }),
          },
        ],
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`OpenRouter returned ${response.status}`);
    const body = await response.json();
    const content = body.choices?.[0]?.message?.content;
    const parsed = planSchema.parse(JSON.parse(content));
    const workloadById = new Map(workload.map((item) => [item.id, item]));
    const unsafeAction = parsed.actions.some((action) => {
      const item = action.assignmentId ? workloadById.get(action.assignmentId) : undefined;
      if (action.assignmentId && !item) return true;
      if (item?.gradeImpact === "high" && ["reduce", "move"].includes(action.kind)) return true;
      const suggestsSkipping = /\b(skip|miss|drop)\b/i.test(`${action.title} ${action.reason}`);
      return suggestsSkipping && item?.gradeImpact !== "low";
    });
    if (unsafeAction) return fallback;
    const actions = [...parsed.actions];
    if (!actions.some((action) => action.kind === "recover")) {
      const recovery = fallback.actions.find((action) => action.kind === "recover");
      if (recovery) actions.push(recovery);
    }
    return { ...parsed, actions: actions.slice(0, 6), model };
  } catch (error) {
    console.error("OpenRouter schedule planning failed", error);
    return fallback;
  }
}
