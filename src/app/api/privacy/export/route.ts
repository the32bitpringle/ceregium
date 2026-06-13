import { NextResponse } from "next/server";
import { decrypt } from "@/lib/encryption";
import { hasSupabaseConfig } from "@/lib/runtime-config";
import { requireUser } from "@/lib/supabase";

export async function GET(request: Request) {
  if (!hasSupabaseConfig()) return NextResponse.json({ mode: "demo" });
  const auth = await requireUser(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const [profile, consents, reflections, analyses, connections, workload, safetyPlan] =
    await Promise.all([
      auth.supabase.from("profiles").select("*").eq("id", auth.user.id).maybeSingle(),
      auth.supabase.from("consents").select("*").eq("user_id", auth.user.id),
      auth.supabase.from("daily_reflections").select("*").eq("user_id", auth.user.id),
      auth.supabase.from("reflection_analyses").select("*").eq("user_id", auth.user.id),
      auth.supabase.from("connections").select("provider, scopes, connected_at, last_synced_at").eq("user_id", auth.user.id),
      auth.supabase.from("workload_items").select("*").eq("user_id", auth.user.id),
      auth.supabase.from("safety_plans").select("verified_at, active, consent_version, cooldown_hours").eq("user_id", auth.user.id).maybeSingle(),
    ]);
  const exportedReflections = (reflections.data ?? []).map((item) => ({
    ...item,
    encrypted_text: undefined,
    text: decrypt(item.encrypted_text),
  }));
  return NextResponse.json({
    exportedAt: new Date().toISOString(),
    profile: profile.data,
    consents: consents.data ?? [],
    reflections: exportedReflections,
    reflectionAnalyses: analyses.data ?? [],
    connections: connections.data ?? [],
    workload: workload.data ?? [],
    safetyPlan: safetyPlan.data,
  });
}
