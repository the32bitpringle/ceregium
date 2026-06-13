import { createHash, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { rateLimit, rateLimited } from "@/lib/api-security";

const itemSchema = z.object({
  externalId: z.string().trim().min(1).max(240),
  title: z.string().trim().min(1).max(160),
  source: z.string().trim().min(1).max(80),
  course: z.string().trim().max(120).optional(),
  dueAt: z.string().datetime(),
  pointsPossible: z.number().min(0).max(100000).optional(),
});

const schema = z.object({
  items: z.array(itemSchema).min(1).max(100),
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function POST(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) {
    return NextResponse.json(
      { error: "Pairing key required" },
      { status: 401, headers: corsHeaders },
    );
  }
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const pairing = db.prepare(`
    select id,user_id from browser_pairings
    where token_hash=? and revoked_at is null
  `).get(tokenHash) as { id: string; user_id: string } | undefined;
  if (!pairing) {
    return NextResponse.json(
      { error: "Invalid or revoked pairing key" },
      { status: 401, headers: corsHeaders },
    );
  }
  const limit = await rateLimit(`browser-import:${pairing.id}`, 30, 60 * 60 * 1000);
  if (!limit.allowed) {
    const response = rateLimited(limit.retryAfter);
    Object.entries(corsHeaders).forEach(([key, value]) => response.headers.set(key, value));
    return response;
  }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid import data" },
      { status: 400, headers: corsHeaders },
    );
  }

  const now = new Date().toISOString();
  const upsert = db.prepare(`
    insert into workload_items(
      id,user_id,external_id,title,source,course,due_at,status,
      points_possible,grade_impact,created_at,updated_at
    ) values(?,?,?,?,?,?,?,?,?,?,?,?)
    on conflict(user_id,source,external_id) do update set
      title=excluded.title,
      course=excluded.course,
      due_at=excluded.due_at,
      status=excluded.status,
      points_possible=excluded.points_possible,
      updated_at=excluded.updated_at
  `);
  db.exec("begin immediate");
  try {
    for (const item of parsed.data.items) {
      const dueAt = new Date(item.dueAt);
      upsert.run(
        randomUUID(),
        pairing.user_id,
        item.externalId,
        item.title,
        item.source,
        item.course || null,
        dueAt.toISOString(),
        dueAt < new Date() ? "overdue" : "upcoming",
        item.pointsPossible ?? null,
        "unknown",
        now,
        now,
      );
    }
    db.exec("commit");
  } catch (error) {
    db.exec("rollback");
    throw error;
  }
  db.prepare("update browser_pairings set last_used_at=? where id=?").run(now, pairing.id);
  return NextResponse.json({ imported: parsed.data.items.length }, { headers: corsHeaders });
}
