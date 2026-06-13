import { NextResponse } from "next/server";
import { z } from "zod";
import { createSession, createUser } from "@/lib/local-auth";
import { rateLimit, rateLimited, clientIp, rejectCrossSite } from "@/lib/api-security";

const schema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(10).max(200),
  displayName: z.string().trim().min(1).max(80),
  dateOfBirth: z.string().date(),
});

export async function POST(request: Request) {
  const rejected = rejectCrossSite(request);
  if (rejected) return rejected;
  const limit = await rateLimit(`signup:${clientIp(request)}`, 10, 60 * 60 * 1000);
  if (!limit.allowed) return rateLimited(limit.retryAfter);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid account details" }, { status: 400 });
  const age = Math.floor(
    (Date.now() - new Date(parsed.data.dateOfBirth).getTime()) / 31_556_952_000,
  );
  if (age < 13) return NextResponse.json({ error: "Ceregium is for students age 13 or older." }, { status: 400 });
  try {
    const id = createUser(parsed.data);
    await createSession(id);
    return NextResponse.json({ signedIn: true });
  } catch (error) {
    if (String(error).includes("UNIQUE")) {
      return NextResponse.json({ error: "An account already exists for this email." }, { status: 409 });
    }
    console.error("Local signup failed", error);
    return NextResponse.json({ error: "Could not create account" }, { status: 500 });
  }
}
