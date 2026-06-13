import { NextResponse } from "next/server";
import { reflectionRequestSchema } from "@/lib/api-schemas";
import { analyzeReflectionWithAI } from "@/lib/analyze-reflection-with-ai";

export async function POST(request: Request) {
  const parsed = reflectionRequestSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid reflection data", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  return NextResponse.json(await analyzeReflectionWithAI(
    parsed.data.text,
    parsed.data.ratings,
    parsed.data.analysisEnabled,
  ));
}
