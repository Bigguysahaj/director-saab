import { NextResponse } from "next/server";
import { createVideoJob, isConfigured } from "@/lib/openrouter";
import type { GenerateRequest } from "@/lib/types";

export async function POST(req: Request) {
  if (!isConfigured()) {
    return NextResponse.json(
      { error: "OPENROUTER_API_KEY is not configured on the server." },
      { status: 501 }
    );
  }

  const body = (await req.json()) as GenerateRequest;
  if (!body.model || !body.prompt?.trim()) {
    return NextResponse.json(
      { error: "model and prompt are required" },
      { status: 400 }
    );
  }

  try {
    const job = await createVideoJob(body);
    return NextResponse.json(job, { status: 202 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Generation request failed" },
      { status: 502 }
    );
  }
}
