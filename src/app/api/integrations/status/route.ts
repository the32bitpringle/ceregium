import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/local-auth";
import { KNOWN_SERVICES } from "@/lib/integrations";

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const pairings = db.prepare(`
    select id,label,last_used_at,created_at from browser_pairings
    where user_id=? and revoked_at is null order by created_at desc
  `).all(user.id);

  const detectedRows = db.prepare(`
    select service,category,last_seen from detected_integrations
    where user_id=? order by last_seen desc
  `).all(user.id) as Array<{ service: string; category: string; last_seen: string }>;

  // Several slugs can map to one product (e.g. canvas + instructure → Canvas);
  // collapse to the most recently seen entry per display name.
  const byName = new Map<string, { name: string; category: string; lastSeen: string }>();
  for (const row of detectedRows) {
    const known = KNOWN_SERVICES[row.service];
    if (!known) continue;
    const existing = byName.get(known.name);
    if (!existing || row.last_seen > existing.lastSeen) {
      byName.set(known.name, { name: known.name, category: known.category, lastSeen: row.last_seen });
    }
  }
  const detectedIntegrations = [...byName.values()];

  return NextResponse.json({ pairings, detectedIntegrations });
}
