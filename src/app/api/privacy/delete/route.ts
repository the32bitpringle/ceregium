import { NextResponse } from "next/server";
import { z } from "zod";
import { hasSupabaseConfig } from "@/lib/runtime-config";
import { createAdminSupabase, requireUser } from "@/lib/supabase";

const schema = z.object({ confirmation: z.literal("DELETE") });

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Type DELETE to confirm" }, { status: 400 });
  if (!hasSupabaseConfig()) return NextResponse.json({ mode: "demo", deleted: true });
  const auth = await requireUser(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = createAdminSupabase();
  if (!admin) return NextResponse.json({ error: "Server is not configured" }, { status: 500 });
  const { error } = await admin.auth.admin.deleteUser(auth.user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ deleted: true });
}
