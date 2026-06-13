import { NextResponse } from "next/server";
import { rejectCrossSite } from "@/lib/api-security";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/local-auth";

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const rejected = rejectCrossSite(request);
  if (rejected) return rejected;
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  db.prepare("delete from workload_items where id=? and user_id=?").run(id, user.id);
  return NextResponse.json({ deleted: true });
}
