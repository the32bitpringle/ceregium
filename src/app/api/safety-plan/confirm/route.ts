import { NextResponse } from "next/server";
import { z } from "zod";
import { rejectCrossSite } from "@/lib/api-security";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/local-auth";

const schema = z.object({
  verificationId: z.string().min(1),
  code: z.string().min(1),
  active: z.boolean(),
});

export async function POST(request: Request) {
  const rejected = rejectCrossSite(request);
  if (rejected) return rejected;
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || parsed.data.code.toUpperCase() !== "LOCAL") {
    return NextResponse.json({ error: "Enter the local verification code." }, { status: 400 });
  }
  db.prepare("update safety_plans set active=?,updated_at=? where user_id=?").run(
    parsed.data.active ? 1 : 0,
    new Date().toISOString(),
    user.id,
  );
  return NextResponse.json({ verified: true });
}
