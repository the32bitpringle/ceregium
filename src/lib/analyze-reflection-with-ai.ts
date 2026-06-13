import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import { analyzeReflection } from "@/lib/analyze-reflection";
import { createBalancePairs } from "@/lib/balancing";
import type { AnalysisResult, ReflectionRatings } from "@/lib/types";

const modelAnalysisSchema = z.object({
  pressure: z.number().min(0).max(100),
  confidence: z.number().min(0).max(1),
  themes: z.array(z.string().min(1).max(40)).max(6),
  protectiveFactors: z.array(z.string().min(1).max(60)).max(5),
  temporalContext: z.enum(["current", "historical", "hypothetical", "quoted", "mixed"]),
  immediateSafetyConcern: z.boolean(),
  summary: z.string().min(1).max(220),
});

export async function analyzeReflectionWithAI(
  text: string,
  ratings: ReflectionRatings,
  analysisEnabled: boolean,
): Promise<AnalysisResult> {
  const deterministic = analyzeReflection(text, ratings, analysisEnabled);
  if (!analysisEnabled || !process.env.OPENAI_API_KEY) {
    return { ...deterministic, model: analysisEnabled ? "deterministic-fallback" : "disabled" };
  }

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const model = process.env.OPENAI_MODEL || "gpt-5.5";
    const response = await openai.responses.parse({
      model,
      reasoning: { effort: "low" },
      instructions: [
        "Analyze a student's private daily reflection for non-diagnostic wellbeing patterns.",
        "Do not diagnose burnout, depression, anxiety, or any medical condition.",
        "Distinguish current experience from quotations, lyrics, jokes, history, and hypotheticals.",
        "Use neutral language. A single difficult day is not a sustained pattern.",
        "Set immediateSafetyConcern only for a plausible current and direct risk of imminent self-harm or harm.",
        "Do not repeat names or sensitive quotations in the summary.",
      ].join(" "),
      input: JSON.stringify({ reflection: text, ratings }),
      text: {
        format: zodTextFormat(modelAnalysisSchema, "reflection_analysis"),
        verbosity: "low",
      },
    });

    const parsed = response.output_parsed;
    if (!parsed) return { ...deterministic, model: "deterministic-fallback" };

    const combinedScore = Math.round(deterministic.score * 0.55 + parsed.pressure * 0.45);
    const score = Math.max(0, Math.min(100, combinedScore));
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
    console.error("OpenAI reflection analysis failed", error);
    return { ...deterministic, model: "deterministic-fallback" };
  }
}
