import { NextResponse } from "next/server";
import { createVideoJob, isConfigured } from "@/lib/openrouter";
import { logSubmittedTake } from "@/lib/takeLog";
import type { GenerateRequest } from "@/lib/types";

export async function POST(req: Request) {
  if (!isConfigured()) {
    return NextResponse.json(
      { error: "OPENROUTER_API_KEY is not configured on the server." },
      { status: 501 }
    );
  }

  // `stage` is the /stage spec the take was recorded from: it goes into the
  // take log, never to OpenRouter.
  const { stage, ...body } = (await req.json()) as GenerateRequest & { stage?: unknown };
  if (!body.model || !body.prompt?.trim()) {
    return NextResponse.json(
      { error: "model and prompt are required" },
      { status: 400 }
    );
  }

  let job;
  try {
    job = await createVideoJob(body);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Generation request failed" },
      { status: 502 }
    );
  }

  // The job is already paid for, so a log failure mustn't fail the request.
  try {
    await logSubmittedTake({ id: job.id, request: body, stage });
  } catch (err) {
    console.error(`Couldn't log take ${job.id}:`, err);
  }
  return NextResponse.json(job, { status: 202 });
}
