import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    mode: "local",
    services: {
      sqlite: true,
      openrouter: Boolean(process.env.OPENROUTER_API_KEY),
      browserCompanion: true,
    },
  });
}
