import { NextResponse } from "next/server";
import { rejectCrossSite } from "@/lib/api-security";
import { destroySession } from "@/lib/local-auth";

export async function POST(request: Request) {
  const rejected = rejectCrossSite(request);
  if (rejected) return rejected;
  await destroySession();
  return NextResponse.json({ signedOut: true });
}
