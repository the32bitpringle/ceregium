import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { reflectionRequestSchema } from "@/lib/api-schemas";
import { analyzeReflectionWithAI } from "@/lib/analyze-reflection-with-ai";
import { db, jsonParse } from "@/lib/db";
import { decrypt, encrypt } from "@/lib/encryption";
import { currentUser } from "@/lib/local-auth";
import { rateLimit, rateLimited, rejectCrossSite } from "@/lib/api-security";
import type { AnalysisResult, Reflection } from "@/lib/types";

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rows = db.prepare(`
    select * from reflections where user_id=? order by local_date desc limit 60
  `).all(user.id) as Array<Record<string, string | number>>;
  const reflections: Reflection[] = rows.map((row) => ({
    id: String(row.id),
    createdAt: String(row.local_date),
    text: decrypt(String(row.encrypted_text)),
    ratings: {
      energy: Number(row.energy),
      stress: Number(row.stress),
      sleep: Number(row.sleep),
      workload: Number(row.workload),
    },
    analysis: jsonParse<AnalysisResult>(String(row.analysis_json), {
      status: "steady",
      score: 0,
      summary: "Saved without analysis.",
      themes: [],
      protectiveFactors: [],
      balances: [],
      confidence: 1,
    }),
  }));
  return NextResponse.json({ reflections });
}

export async function POST(request: Request) {
  const rejected = rejectCrossSite(request);
  if (rejected) return rejected;
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limit = await rateLimit(`reflection:${user.id}`, 30, 60 * 60 * 1000);
  if (!limit.allowed) return rateLimited(limit.retryAfter);
  const parsed = reflectionRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid reflection data" }, { status: 400 });

  const analysis = await analyzeReflectionWithAI(
    parsed.data.text,
    parsed.data.ratings,
    parsed.data.analysisEnabled,
  );
  const localDate = new Date().toLocaleDateString("en-CA", { timeZone: user.timezone });
  const now = new Date().toISOString();
  const existing = db.prepare(
    "select id from reflections where user_id=? and local_date=?",
  ).get(user.id, localDate) as { id: string } | undefined;
  const id = existing?.id ?? randomUUID();
  db.prepare(`
    insert into reflections(
      id,user_id,local_date,encrypted_text,energy,stress,sleep,workload,
      analysis_json,created_at,updated_at
    ) values(?,?,?,?,?,?,?,?,?,?,?)
    on conflict(user_id,local_date) do update set
      encrypted_text=excluded.encrypted_text,
      energy=excluded.energy,
      stress=excluded.stress,
      sleep=excluded.sleep,
      workload=excluded.workload,
      analysis_json=excluded.analysis_json,
      updated_at=excluded.updated_at
  `).run(
    id,
    user.id,
    localDate,
    encrypt(parsed.data.text),
    parsed.data.ratings.energy,
    parsed.data.ratings.stress,
    parsed.data.ratings.sleep,
    parsed.data.ratings.workload,
    JSON.stringify(analysis),
    now,
    now,
  );
  return NextResponse.json({
    reflection: {
      id,
      createdAt: localDate,
      text: parsed.data.text,
      ratings: parsed.data.ratings,
      analysis,
    } satisfies Reflection,
  });
}
