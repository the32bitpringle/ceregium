import "server-only";

import { z } from "zod";
import { analyzeReflection } from "@/lib/analyze-reflection";
import { createBalancePairs } from "@/lib/balancing";
import type { AnalysisResult, ReflectionRatings } from "@/lib/types";

const resultSchema = z.object({
  pressure: z.number().min(0).max(100),
  confidence: z.number().min(0).max(1),
  themes: z.array(z.string().min(1).max(40)).max(6),
  protectiveFactors: z.array(z.string().min(1).max(60)).max(5),
  immediateSafetyConcern: z.boolean(),
  summary: z.string().min(1).max(220),
});

export async function analyzeReflectionWithAI(
  text: string,
  ratings: ReflectionRatings,
  analysisEnabled: boolean,
): Promise<AnalysisResult> {
  const deterministic = analyzeReflection(text, ratings, analysisEnabled);
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!analysisEnabled || !apiKey) {
    return { ...deterministic, model: analysisEnabled ? "deterministic-fallback" : "disabled" };
  }

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
              "Analyze a student's private daily reflection for non-diagnostic wellbeing patterns.",
              "Return JSON with pressure, confidence, themes, protectiveFactors, immediateSafetyConcern, summary.",
              "Do not diagnose burnout, depression, anxiety, or any medical condition.",
              "A single difficult day is not a sustained pattern.",
              "Set immediateSafetyConcern only for plausible current direct risk of imminent harm.",
              "Use neutral language and do not repeat names or sensitive quotations.",
            ].join(" "),
          },
          { role: "user", content: JSON.stringify({ reflection: text, ratings }) },
        ],
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`OpenRouter returned ${response.status}`);
    const body = await response.json();
    const content = body.choices?.[0]?.message?.content;
    const parsed = resultSchema.parse(JSON.parse(content));
    const score = Math.max(
      0,
      Math.min(100, Math.round(deterministic.score * 0.55 + parsed.pressure * 0.45)),
    );
    const status =
      score >= 85 && parsed.immediateSafetyConcern
        ? "critical"
        : score >= 68
          ? "elevated"
          : score >= 48
            ? "watch"
            : "steady";
    const themes = [...new Set([...deterministic.themes, ...parsed.themes])].slice(0, 6);
    const protectiveFactors = [
      ...new Set([...deterministic.protectiveFactors, ...parsed.protectiveFactors]),
    ].slice(0, 5);
    return {
      status,
      score,
      summary: parsed.summary,
      themes,
      protectiveFactors,
      balances: createBalancePairs(themes, protectiveFactors),
      confidence: Number(((deterministic.confidence + parsed.confidence) / 2).toFixed(2)),
      immediateSafetyConcern: parsed.immediateSafetyConcern,
      model,
    };
  } catch (error) {
    console.error("OpenRouter reflection analysis failed", error);
    return { ...deterministic, model: "deterministic-fallback" };
  }
}
