import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { rejectCrossSite } from "@/lib/api-security";
import { db } from "@/lib/db";
import { encrypt } from "@/lib/encryption";
import { currentUser } from "@/lib/local-auth";

const schema = z.object({ destination: z.string().trim().min(3).max(160) });

export async function POST(request: Request) {
  const rejected = rejectCrossSite(request);
  if (rejected) return rejected;
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid contact" }, { status: 400 });
  const id = randomUUID();
  db.prepare(`
    insert into safety_plans(user_id,encrypted_contact,active,updated_at)
    values(?,?,0,?)
    on conflict(user_id) do update set encrypted_contact=excluded.encrypted_contact,updated_at=excluded.updated_at
  `).run(user.id, encrypt(parsed.data.destination), new Date().toISOString());
  return NextResponse.json({
    verificationId: id,
    previewCode: "LOCAL",
    localOnly: true,
  });
}
