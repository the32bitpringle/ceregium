import { NextResponse } from "next/server";
import { z } from "zod";
import { hasSupabaseConfig } from "@/lib/runtime-config";
import { requireUser } from "@/lib/supabase";

const profileSchema = z.object({
  dateOfBirth: z.string().date(),
  displayName: z.string().trim().min(1).max(80).optional(),
});

export async function GET(request: Request) {
  if (!hasSupabaseConfig()) return NextResponse.json({ mode: "demo", profile: null });
  const auth = await requireUser(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data, error } = await auth.supabase
    .from("profiles")
    .select("id, display_name, date_of_birth, timezone, settings")
    .eq("id", auth.user.id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ mode: "configured", profile: data });
}

export async function POST(request: Request) {
  if (!hasSupabaseConfig()) return NextResponse.json({ mode: "demo" });
  const auth = await requireUser(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = profileSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid profile" }, { status: 400 });

  const age = Math.floor(
    (Date.now() - new Date(parsed.data.dateOfBirth).getTime()) / (365.2425 * 24 * 60 * 60 * 1000),
  );
  if (age < 13) return NextResponse.json({ error: "Ceregium is for students age 13 or older." }, { status: 400 });

  const { error } = await auth.supabase.from("profiles").upsert({
    id: auth.user.id,
    date_of_birth: parsed.data.dateOfBirth,
    display_name: parsed.data.displayName,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ saved: true });
}
