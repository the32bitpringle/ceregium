import { createHash, randomBytes, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { rejectCrossSite } from "@/lib/api-security";
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

export async function POST(request: Request) {
  const rejected = rejectCrossSite(request);
  if (rejected) return rejected;
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = randomUUID();
  const token = `ceregium_${randomBytes(24).toString("base64url")}`;
  db.prepare(`
    insert into browser_pairings(id,user_id,token_hash,label,created_at)
    values(?,?,?,?,?)
  `).run(
    id,
    user.id,
    createHash("sha256").update(token).digest("hex"),
    "Browser companion",
    new Date().toISOString(),
  );
  return NextResponse.json({ pairing: { id, token } });
}

export async function DELETE(request: Request) {
  const rejected = rejectCrossSite(request);
  if (rejected) return rejected;
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Pairing id is required" }, { status: 400 });
  db.prepare(
    "update browser_pairings set revoked_at=? where id=? and user_id=?",
  ).run(new Date().toISOString(), id, user.id);
  return NextResponse.json({ revoked: true });
}
