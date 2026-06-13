import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/local-auth";

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const pairings = db.prepare(`
    select id,label,last_used_at,created_at from browser_pairings
    where user_id=? and revoked_at is null order by created_at desc
  `).all(user.id);
  return NextResponse.json({ pairings });
}
