import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { rateLimit, rateLimited } from "@/lib/api-security";

const schema = z.object({
  localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  activeMinutes: z.number().int().min(0).max(1440),
  educationMinutes: z.number().int().min(0).max(1440),
  productivityMinutes: z.number().int().min(0).max(1440),
  socialMinutes: z.number().int().min(0).max(1440),
  entertainmentMinutes: z.number().int().min(0).max(1440),
  otherMinutes: z.number().int().min(0).max(1440),
  lateNightMinutes: z.number().int().min(0).max(1440),
  longestSessionMinutes: z.number().int().min(0).max(1440),
  tabSwitches: z.number().int().min(0).max(100000),
  breakCount: z.number().int().min(0).max(1440),
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
  const limit = await rateLimit(`browser-signals:${pairing.id}`, 120, 60 * 60 * 1000);
  if (!limit.allowed) {
    const response = rateLimited(limit.retryAfter);
    Object.entries(corsHeaders).forEach(([key, value]) => response.headers.set(key, value));
    return response;
  }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid activity summary" },
      { status: 400, headers: corsHeaders },
    );
  }
  const summary = parsed.data;
  const categorized =
    summary.educationMinutes +
    summary.productivityMinutes +
    summary.socialMinutes +
    summary.entertainmentMinutes +
    summary.otherMinutes;
  if (categorized > summary.activeMinutes + 5) {
    return NextResponse.json(
      { error: "Activity categories exceed active time" },
      { status: 400, headers: corsHeaders },
    );
  }
  const now = new Date().toISOString();
  db.prepare(`
    insert into browser_activity_daily(
      user_id,local_date,active_minutes,education_minutes,productivity_minutes,
      social_minutes,entertainment_minutes,other_minutes,late_night_minutes,
      longest_session_minutes,tab_switches,break_count,updated_at
    ) values(?,?,?,?,?,?,?,?,?,?,?,?,?)
    on conflict(user_id,local_date) do update set
      active_minutes=max(active_minutes,excluded.active_minutes),
      education_minutes=max(education_minutes,excluded.education_minutes),
      productivity_minutes=max(productivity_minutes,excluded.productivity_minutes),
      social_minutes=max(social_minutes,excluded.social_minutes),
      entertainment_minutes=max(entertainment_minutes,excluded.entertainment_minutes),
      other_minutes=max(other_minutes,excluded.other_minutes),
      late_night_minutes=max(late_night_minutes,excluded.late_night_minutes),
      longest_session_minutes=max(longest_session_minutes,excluded.longest_session_minutes),
      tab_switches=max(tab_switches,excluded.tab_switches),
      break_count=max(break_count,excluded.break_count),
      updated_at=excluded.updated_at
  `).run(
    pairing.user_id,
    summary.localDate,
    summary.activeMinutes,
    summary.educationMinutes,
    summary.productivityMinutes,
    summary.socialMinutes,
    summary.entertainmentMinutes,
    summary.otherMinutes,
    summary.lateNightMinutes,
    summary.longestSessionMinutes,
    summary.tabSwitches,
    summary.breakCount,
    now,
  );
  db.prepare("update browser_pairings set last_used_at=? where id=?").run(now, pairing.id);
  return NextResponse.json({ stored: true }, { headers: corsHeaders });
}
