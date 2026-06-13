import { NextResponse } from "next/server";
import { db, jsonParse } from "@/lib/db";
import { decrypt } from "@/lib/encryption";
import { currentUser } from "@/lib/local-auth";

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const reflections = (db.prepare("select * from reflections where user_id=?").all(user.id) as Array<Record<string, unknown>>).map(
    (row) => ({
      id: row.id,
      localDate: row.local_date,
      text: decrypt(String(row.encrypted_text)),
      energy: row.energy,
      stress: row.stress,
      sleep: row.sleep,
      workload: row.workload,
      analysis: jsonParse(String(row.analysis_json), {}),
    }),
  );
  const workload = db.prepare("select * from workload_items where user_id=?").all(user.id);
  const pairings = db.prepare(
    "select id,label,last_used_at,created_at,revoked_at from browser_pairings where user_id=?",
  ).all(user.id);
  return NextResponse.json({
    exportedAt: new Date().toISOString(),
    profile: user,
    reflections,
    workload,
    browserPairings: pairings,
  });
}
