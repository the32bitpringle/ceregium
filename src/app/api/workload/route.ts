import { NextResponse } from "next/server";
import { hasSupabaseConfig } from "@/lib/runtime-config";
import { requireUser } from "@/lib/supabase";

export async function GET(request: Request) {
  if (!hasSupabaseConfig()) return NextResponse.json({ mode: "demo", items: [] });
  const auth = await requireUser(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data, error } = await auth.supabase
    .from("workload_items")
    .select("id, title, source, course, due_at, status, points_possible, grade_impact")
    .eq("user_id", auth.user.id)
    .order("due_at", { ascending: true })
    .limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({
    mode: "configured",
    items: (data ?? []).map((item) => ({
      id: item.id,
      title: item.title,
      source: item.source,
      course: item.course,
      dueAt: item.due_at,
      status: item.status,
      pointsPossible: item.points_possible === null ? undefined : Number(item.points_possible),
      gradeImpact: item.grade_impact ?? "unknown",
    })),
  });
}

export async function PATCH(request: Request) {
  if (!hasSupabaseConfig()) return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });
  const auth = await requireUser(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json();
  const allowed = new Set(["low", "medium", "high", "unknown"]);
  if (typeof body.id !== "string" || !allowed.has(body.gradeImpact)) {
    return NextResponse.json({ error: "Invalid grade impact" }, { status: 400 });
  }
  const { error } = await auth.supabase
    .from("workload_items")
    .update({ grade_impact: body.gradeImpact, updated_at: new Date().toISOString() })
    .eq("id", body.id)
    .eq("user_id", auth.user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ updated: true });
}
