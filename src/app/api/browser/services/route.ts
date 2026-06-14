import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { rateLimit, rateLimited } from "@/lib/api-security";
import { KNOWN_SERVICE_SLUGS, KNOWN_SERVICES } from "@/lib/integrations";

const schema = z.object({
  services: z.array(z.enum(KNOWN_SERVICE_SLUGS)).min(1).max(40),
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
  const pairing = db.prepare(`
    select id,user_id from browser_pairings
    where token_hash=? and revoked_at is null
  `).get(createHash("sha256").update(token).digest("hex")) as
    | { id: string; user_id: string }
    | undefined;
  if (!pairing) {
    return NextResponse.json(
      { error: "Invalid or revoked pairing key" },
      { status: 401, headers: corsHeaders },
    );
  }
  const limit = await rateLimit(`browser-services:${pairing.id}`, 120, 60 * 60 * 1000);
  if (!limit.allowed) {
    const response = rateLimited(limit.retryAfter);
    Object.entries(corsHeaders).forEach(([key, value]) => response.headers.set(key, value));
    return response;
  }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid service list" },
      { status: 400, headers: corsHeaders },
    );
  }

  const now = new Date().toISOString();
  const upsert = db.prepare(`
    insert into detected_integrations(user_id,service,category,first_seen,last_seen)
    values(?,?,?,?,?)
    on conflict(user_id,service) do update set last_seen=excluded.last_seen
  `);
  const unique = [...new Set(parsed.data.services)];
  db.exec("begin immediate");
  try {
    for (const service of unique) {
      upsert.run(pairing.user_id, service, KNOWN_SERVICES[service].category, now, now);
    }
    db.exec("commit");
  } catch (error) {
    db.exec("rollback");
    throw error;
  }
  db.prepare("update browser_pairings set last_used_at=? where id=?").run(now, pairing.id);
  return NextResponse.json({ stored: unique.length }, { headers: corsHeaders });
}
