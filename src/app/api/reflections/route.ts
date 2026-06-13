import { NextResponse } from "next/server";
import { reflectionRequestSchema } from "@/lib/api-schemas";
import { analyzeReflectionWithAI } from "@/lib/analyze-reflection-with-ai";
import { decrypt, encrypt } from "@/lib/encryption";
import { hasSupabaseConfig } from "@/lib/runtime-config";
import { requireUser } from "@/lib/supabase";
import type { Reflection } from "@/lib/types";
import { createBalancePairs } from "@/lib/balancing";

export async function GET(request: Request) {
  if (!hasSupabaseConfig()) {
    return NextResponse.json({ mode: "demo", reflections: [] });
  }
  const auth = await requireUser(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await auth.supabase
    .from("daily_reflections")
    .select("id, local_date, encrypted_text, energy, stress, sleep, workload, reflection_analyses(*)")
    .order("local_date", { ascending: false })
    .limit(60);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const reflections: Reflection[] = (data ?? []).map((row) => {
    const analysis = Array.isArray(row.reflection_analyses)
      ? row.reflection_analyses[0]
      : row.reflection_analyses;
    return {
      id: row.id,
      createdAt: row.local_date,
      text: decrypt(row.encrypted_text),
      ratings: {
        energy: row.energy,
        stress: row.stress,
        sleep: row.sleep,
        workload: row.workload,
      },
      analysis: {
        status: analysis?.status ?? "steady",
        score: analysis?.score ?? 0,
        summary: analysis?.summary ?? "Saved without analysis.",
        themes: analysis?.themes ?? [],
        protectiveFactors: analysis?.protective_factors ?? [],
        balances:
          analysis?.balances ??
          createBalancePairs(analysis?.themes ?? [], analysis?.protective_factors ?? []),
        confidence: Number(analysis?.confidence ?? 1),
        immediateSafetyConcern: analysis?.immediate_safety_concern ?? false,
        model: analysis?.model_versions?.reflection,
      },
    };
  });

  return NextResponse.json({ mode: "configured", reflections });
}

export async function POST(request: Request) {
  if (!hasSupabaseConfig()) {
    return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });
  }
  const auth = await requireUser(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = reflectionRequestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid reflection data" }, { status: 400 });
  }

  const analysis = await analyzeReflectionWithAI(
    parsed.data.text,
    parsed.data.ratings,
    parsed.data.analysisEnabled,
  );
  const localDate = new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
  const { data: reflection, error: reflectionError } = await auth.supabase
    .from("daily_reflections")
    .upsert(
      {
        user_id: auth.user.id,
        local_date: localDate,
        encrypted_text: encrypt(parsed.data.text),
        ...parsed.data.ratings,
        analysis_enabled: parsed.data.analysisEnabled,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,local_date" },
    )
    .select("id")
    .single();

  if (reflectionError || !reflection) {
    return NextResponse.json({ error: reflectionError?.message ?? "Could not save reflection" }, { status: 500 });
  }

  const { error: analysisError } = await auth.supabase.from("reflection_analyses").upsert(
    {
      reflection_id: reflection.id,
      user_id: auth.user.id,
      status: analysis.status,
      score: analysis.score,
      confidence: analysis.confidence,
      themes: analysis.themes,
      protective_factors: analysis.protectiveFactors,
      balances: analysis.balances,
      summary: analysis.summary,
      immediate_safety_concern: analysis.immediateSafetyConcern ?? false,
      model_versions: { reflection: analysis.model ?? "deterministic" },
    },
    { onConflict: "reflection_id" },
  );

  if (analysisError) {
    return NextResponse.json({ error: analysisError.message }, { status: 500 });
  }

  return NextResponse.json({
    reflection: {
      id: reflection.id,
      createdAt: localDate,
      text: parsed.data.text,
      ratings: parsed.data.ratings,
      analysis,
    } satisfies Reflection,
  });
}
