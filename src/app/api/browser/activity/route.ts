import { NextResponse } from "next/server";
import { mapActivityDay } from "@/lib/activity";
import { rejectCrossSite } from "@/lib/api-security";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/local-auth";

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rows = db.prepare(`
    select * from browser_activity_daily
    where user_id=? order by local_date desc limit 14
  `).all(user.id) as Array<Record<string, unknown>>;
  return NextResponse.json({ activity: rows.map(mapActivityDay) });
}

export async function DELETE(request: Request) {
  const rejected = rejectCrossSite(request);
  if (rejected) return rejected;
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  db.prepare("delete from browser_activity_daily where user_id=?").run(user.id);
  db.prepare("delete from schedule_plans where user_id=?").run(user.id);
  return NextResponse.json({ deleted: true });
}
