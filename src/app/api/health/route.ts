import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  try {
    db.prepare("select 1").get();
    return NextResponse.json({
      status: "ok",
      storage: "sqlite",
      ai: process.env.OPENROUTER_API_KEY ? "openrouter" : "deterministic",
      timestamp: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json({ status: "not_ready" }, { status: 503 });
  }
}
