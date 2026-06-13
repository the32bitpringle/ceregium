import { NextResponse } from "next/server";
import { z } from "zod";
import { hasSupabaseConfig } from "@/lib/runtime-config";
import { requireUser } from "@/lib/supabase";
import { hashVerificationCode } from "@/lib/verification";

const confirmSchema = z.object({
  verificationId: z.string().min(1),
  code: z.string().regex(/^\d{6}$/),
  active: z.boolean(),
});

export async function POST(request: Request) {
  const parsed = confirmSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid verification code" }, { status: 400 });
  if (!hasSupabaseConfig()) {
    return NextResponse.json({
      verified: parsed.data.verificationId === "demo-verification",
      mode: "demo",
    });
  }
  const auth = await requireUser(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data, error } = await auth.supabase
    .from("trusted_contact_verifications")
    .select("*")
    .eq("id", parsed.data.verificationId)
    .eq("user_id", auth.user.id)
    .single();
  if (error || !data) return NextResponse.json({ error: "Verification not found" }, { status: 404 });
  if (new Date(data.expires_at) < new Date()) {
    return NextResponse.json({ error: "Verification code expired" }, { status: 400 });
  }
  if (data.attempts >= 5 || data.code_hash !== hashVerificationCode(parsed.data.code)) {
    await auth.supabase
      .from("trusted_contact_verifications")
      .update({ attempts: data.attempts + 1 })
      .eq("id", data.id);
    return NextResponse.json({ error: "Incorrect verification code" }, { status: 400 });
  }
  const verifiedAt = new Date().toISOString();
  await auth.supabase
    .from("trusted_contact_verifications")
    .update({ verified_at: verifiedAt })
    .eq("id", data.id);
  const { error: planError } = await auth.supabase.from("safety_plans").upsert(
    {
      user_id: auth.user.id,
      encrypted_contact: data.encrypted_destination,
      contact_type: data.destination_type,
      verified_at: verifiedAt,
      active: parsed.data.active,
      consent_version: "2026-06-13",
      updated_at: verifiedAt,
    },
    { onConflict: "user_id" },
  );
  if (planError) return NextResponse.json({ error: planError.message }, { status: 500 });
  return NextResponse.json({ verified: true, mode: "configured" });
}
