import { NextResponse } from "next/server";
import { z } from "zod";
import { rejectCrossSite } from "@/lib/api-security";
import { db } from "@/lib/db";
import { currentUser, destroySession } from "@/lib/local-auth";

const schema = z.object({ confirmation: z.literal("DELETE") });

export async function POST(request: Request) {
  const rejected = rejectCrossSite(request);
  if (rejected) return rejected;
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Type DELETE to confirm" }, { status: 400 });
  db.prepare("delete from users where id=?").run(user.id);
  await destroySession();
  return NextResponse.json({ deleted: true });
}
