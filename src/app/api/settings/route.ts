import { NextResponse } from "next/server";
import { rejectCrossSite } from "@/lib/api-security";
import { settingsSchema } from "@/lib/api-schemas";
import { db, jsonParse } from "@/lib/db";
import { currentUser } from "@/lib/local-auth";
import type { AppSettings } from "@/lib/types";

const defaults: AppSettings = {
  timezone: "America/Los_Angeles",
  reducedMotion: false,
  digestEnabled: true,
  digestHour: 7,
  analysisEnabled: true,
};

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const row = db.prepare("select settings_json from users where id=?").get(user.id) as
    | { settings_json: string }
    | undefined;
  return NextResponse.json({ settings: jsonParse(row?.settings_json, defaults) });
}

export async function PATCH(request: Request) {
  const rejected = rejectCrossSite(request);
  if (rejected) return rejected;
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = settingsSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid settings" }, { status: 400 });
  db.prepare("update users set settings_json=?,timezone=? where id=?").run(
    JSON.stringify(parsed.data),
    parsed.data.timezone,
    user.id,
  );
  return NextResponse.json({ settings: parsed.data });
}
