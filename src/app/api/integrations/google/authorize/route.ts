import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { googleScopes } from "@/lib/google";
import { createOAuthState } from "@/lib/oauth-state";
import { hasGoogleConfig } from "@/lib/runtime-config";
import { requireUser } from "@/lib/supabase";

export async function GET(request: Request) {
  if (!hasGoogleConfig()) {
    return NextResponse.json({ error: "Google OAuth is not configured" }, { status: 503 });
  }
  const auth = await requireUser(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const state = createOAuthState({
    userId: auth.user.id,
    expiresAt: Date.now() + 10 * 60 * 1000,
    nonce: randomUUID(),
  });
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: process.env.GOOGLE_REDIRECT_URI!,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    scope: googleScopes.join(" "),
    state,
  });
  return NextResponse.json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params}` });
}
