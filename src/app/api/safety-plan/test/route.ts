import { NextResponse } from "next/server";
import { decrypt } from "@/lib/encryption";
import { sendTrustedContactTest } from "@/lib/notifications";
import { hasSupabaseConfig } from "@/lib/runtime-config";
import { requireUser } from "@/lib/supabase";

export async function POST(request: Request) {
  if (!hasSupabaseConfig()) return NextResponse.json({ mode: "demo", delivered: false });
  const auth = await requireUser(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data, error } = await auth.supabase
    .from("safety_plans")
    .select("*")
    .eq("user_id", auth.user.id)
    .single();
  if (error || !data?.verified_at) {
    return NextResponse.json({ error: "Trusted contact is not verified" }, { status: 400 });
  }
  const result = await sendTrustedContactTest(data.contact_type, decrypt(data.encrypted_contact));
  return NextResponse.json({ delivered: result.delivered });
}
