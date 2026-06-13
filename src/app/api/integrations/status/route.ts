import { NextResponse } from "next/server";
import { hasSupabaseConfig } from "@/lib/runtime-config";
import { requireUser } from "@/lib/supabase";

export async function GET(request: Request) {
  if (!hasSupabaseConfig()) return NextResponse.json({ mode: "demo", providers: [] });
  const auth = await requireUser(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data, error } = await auth.supabase
    .from("connections")
    .select("provider, last_synced_at, scopes")
    .eq("user_id", auth.user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ mode: "configured", providers: data ?? [] });
}
