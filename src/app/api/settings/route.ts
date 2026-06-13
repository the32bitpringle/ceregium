import { NextResponse } from "next/server";
import { settingsSchema } from "@/lib/api-schemas";
import { hasSupabaseConfig } from "@/lib/runtime-config";
import { requireUser } from "@/lib/supabase";

export async function GET(request: Request) {
  if (!hasSupabaseConfig()) return NextResponse.json({ mode: "demo", settings: null });
  const auth = await requireUser(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data, error } = await auth.supabase
    .from("profiles")
    .select("settings")
    .eq("id", auth.user.id)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ mode: "configured", settings: data.settings });
}

export async function PATCH(request: Request) {
  const parsed = settingsSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid settings" }, { status: 400 });
  if (!hasSupabaseConfig()) return NextResponse.json({ mode: "demo", settings: parsed.data });
  const auth = await requireUser(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { error } = await auth.supabase
    .from("profiles")
    .update({ settings: parsed.data, timezone: parsed.data.timezone })
    .eq("id", auth.user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ settings: parsed.data });
}
