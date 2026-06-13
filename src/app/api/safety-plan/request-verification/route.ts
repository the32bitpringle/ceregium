import { NextResponse } from "next/server";
import { z } from "zod";
import { encrypt } from "@/lib/encryption";
import { sendVerification } from "@/lib/notifications";
import { hasSupabaseConfig } from "@/lib/runtime-config";
import { requireUser } from "@/lib/supabase";
import {
  createVerificationCode,
  destinationType,
  hashVerificationCode,
} from "@/lib/verification";

const requestSchema = z.object({
  destination: z.string().trim().min(5).max(160),
});

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid destination" }, { status: 400 });
  const channel = destinationType(parsed.data.destination);
  const code = createVerificationCode();
  const delivery = await sendVerification(channel, parsed.data.destination, code);

  if (!hasSupabaseConfig()) {
    return NextResponse.json({
      mode: "demo",
      verificationId: "demo-verification",
      delivered: delivery.delivered,
      previewCode: code,
    });
  }

  const auth = await requireUser(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data, error } = await auth.supabase
    .from("trusted_contact_verifications")
    .insert({
      user_id: auth.user.id,
      encrypted_destination: encrypt(parsed.data.destination),
      destination_type: channel,
      code_hash: hashVerificationCode(code),
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    })
    .select("id")
    .single();
  if (error || !data) return NextResponse.json({ error: error?.message ?? "Could not verify" }, { status: 500 });
  return NextResponse.json({
    mode: "configured",
    verificationId: data.id,
    delivered: delivery.delivered,
    previewCode: process.env.NODE_ENV === "production" ? undefined : code,
  });
}
