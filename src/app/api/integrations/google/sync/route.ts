import { NextResponse } from "next/server";
import { encryptTokenSet, fetchGoogleWorkload, validGoogleTokens } from "@/lib/google";
import { requireUser } from "@/lib/supabase";

export async function POST(request: Request) {
  const auth = await requireUser(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: connection, error } = await auth.supabase
    .from("connections")
    .select("id, user_id, provider, encrypted_tokens, scopes")
    .eq("user_id", auth.user.id)
    .eq("provider", "google")
    .single();
  if (error || !connection) return NextResponse.json({ error: "Google is not connected" }, { status: 404 });

  try {
    const tokens = await validGoogleTokens({
      id: connection.id,
      userId: connection.user_id,
      provider: connection.provider,
      encryptedTokens: connection.encrypted_tokens,
      scopes: connection.scopes,
    });
    const items = await fetchGoogleWorkload(tokens.accessToken);
    const rows = items.map((item) => ({
      user_id: auth.user.id,
      connection_id: connection.id,
      external_id: item.id,
      title: item.title,
      source: item.source,
      course: item.course,
      due_at: item.dueAt,
      status: item.status,
      points_possible: item.pointsPossible,
      grade_impact: item.gradeImpact ?? "unknown",
      updated_at: new Date().toISOString(),
    }));
    if (rows.length) {
      const { error: workloadError } = await auth.supabase
        .from("workload_items")
        .upsert(rows, { onConflict: "user_id,source,external_id" });
      if (workloadError) throw workloadError;
    }
    await auth.supabase
      .from("connections")
      .update({
        encrypted_tokens: encryptTokenSet(tokens),
        last_synced_at: new Date().toISOString(),
      })
      .eq("id", connection.id);
    return NextResponse.json({ synced: items.length });
  } catch (syncError) {
    console.error("Google sync failed", syncError);
    return NextResponse.json({ error: "Google sync failed" }, { status: 502 });
  }
}
