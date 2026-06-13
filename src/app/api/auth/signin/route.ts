import { NextResponse } from "next/server";
import { z } from "zod";
import { createSession, passwordMatches, userByEmail } from "@/lib/local-auth";
import { clientIp, rateLimit, rateLimited, rejectCrossSite } from "@/lib/api-security";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(200),
});

export async function POST(request: Request) {
  const rejected = rejectCrossSite(request);
  if (rejected) return rejected;
  const limit = await rateLimit(`signin:${clientIp(request)}`, 20, 15 * 60 * 1000);
  if (!limit.allowed) return rateLimited(limit.retryAfter);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid email or password" }, { status: 400 });
  const user = userByEmail(parsed.data.email);
  if (!user || !passwordMatches(parsed.data.password, user.password_hash)) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }
  await createSession(user.id);
  return NextResponse.json({ signedIn: true });
}
