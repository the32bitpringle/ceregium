import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { rejectCrossSite } from "@/lib/api-security";
import { workloadCreateSchema, workloadUpdateSchema } from "@/lib/api-schemas";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/local-auth";

function mapItem(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    title: String(row.title),
    source: String(row.source),
    course: row.course ? String(row.course) : undefined,
    dueAt: String(row.due_at),
    status: String(row.status),
    pointsPossible: row.points_possible === null ? undefined : Number(row.points_possible),
    gradeImpact: String(row.grade_impact || "unknown"),
  };
}

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rows = db.prepare(
    "select * from workload_items where user_id=? order by due_at asc limit 200",
  ).all(user.id) as Array<Record<string, unknown>>;
  return NextResponse.json({ items: rows.map(mapItem) });
}

export async function PATCH(request: Request) {
  const rejected = rejectCrossSite(request);
  if (rejected) return rejected;
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = workloadUpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid grade impact" }, { status: 400 });
  db.prepare(
    "update workload_items set grade_impact=?,updated_at=? where id=? and user_id=?",
  ).run(parsed.data.gradeImpact, new Date().toISOString(), parsed.data.id, user.id);
  return NextResponse.json({ updated: true });
}

export async function POST(request: Request) {
  const rejected = rejectCrossSite(request);
  if (rejected) return rejected;
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = workloadCreateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid assignment" }, { status: 400 });
  const now = new Date().toISOString();
  const id = randomUUID();
  const dueAt = new Date(parsed.data.dueAt);
  db.prepare(`
    insert into workload_items(
      id,user_id,external_id,title,source,course,due_at,status,
      points_possible,grade_impact,created_at,updated_at
    ) values(?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    id,
    user.id,
    `manual-${id}`,
    parsed.data.title,
    "Manual",
    parsed.data.course || null,
    dueAt.toISOString(),
    dueAt < new Date() ? "overdue" : "upcoming",
    parsed.data.pointsPossible ?? null,
    parsed.data.gradeImpact,
    now,
    now,
  );
  const row = db.prepare("select * from workload_items where id=?").get(id) as Record<string, unknown>;
  return NextResponse.json({ item: mapItem(row) });
}
