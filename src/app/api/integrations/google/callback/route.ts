import { NextResponse } from "next/server";
import { encryptTokenSet, exchangeGoogleCode } from "@/lib/google";
import { verifyOAuthState } from "@/lib/oauth-state";
import { createAdminSupabase } from "@/lib/supabase";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return NextResponse.redirect(new URL("/?google=missing", request.url));
  const payload = verifyOAuthState(state);
  if (!payload) return NextResponse.redirect(new URL("/?google=invalid-state", request.url));
  const admin = createAdminSupabase();
  if (!admin) return NextResponse.redirect(new URL("/?google=server-config", request.url));

  try {
    const tokens = await exchangeGoogleCode(code);
    const { error } = await admin.from("connections").upsert(
      {
        user_id: payload.userId,
        provider: "google",
        encrypted_tokens: encryptTokenSet(tokens),
        scopes: tokens.scopes,
        connected_at: new Date().toISOString(),
      },
      { onConflict: "user_id,provider" },
    );
    if (error) throw error;
    return NextResponse.redirect(new URL("/?google=connected", request.url));
  } catch (error) {
    console.error("Google OAuth callback failed", error);
    return NextResponse.redirect(new URL("/?google=failed", request.url));
  }
}
