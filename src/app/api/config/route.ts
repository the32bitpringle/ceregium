import { NextResponse } from "next/server";
import {
  hasEmailConfig,
  hasGoogleConfig,
  hasOpenAIConfig,
  hasSmsConfig,
  hasSupabaseConfig,
} from "@/lib/runtime-config";

export async function GET() {
  return NextResponse.json({
    mode: hasSupabaseConfig() ? "configured" : "demo",
    services: {
      supabase: hasSupabaseConfig(),
      google: hasGoogleConfig(),
      openai: hasOpenAIConfig(),
      email: hasEmailConfig(),
      sms: hasSmsConfig(),
    },
  });
}
