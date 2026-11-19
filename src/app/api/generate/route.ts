import { NextResponse } from "next/server";
import { MediaConfigError, publishDataReferences } from "@/lib/mediaReference";
import { createVideoTask, isArkConfigured } from "@/lib/modelark";
import { createVideoJob, isConfigured } from "@/lib/openrouter";
import { resolveProjectId } from "@/lib/projectStore";
import { logSubmittedTake } from "@/lib/takeLog";
import type { GenerateTakeRequest } from "@/lib/types";

export async function POST(req: Request) {
  // `stage` (the /stage spec the take was recorded from) and `project` go
  // into the take log, never to OpenRouter.
  const { stage, project, ...body } = (await req.json()) as GenerateTakeRequest;
  if (!body.model || !body.prompt?.trim()) {
    return NextResponse.json(
      { error: "model and prompt are required" },
      { status: 400 }
    );
  }
  const ark = body.model.startsWith("modelark/");
  if (ark ? !isArkConfigured() : !isConfigured()) {
    return NextResponse.json(
      { error: `${ark ? "ARK_API_KEY" : "OPENROUTER_API_KEY"} is not configured on the server.` },
      { status: 501 }
    );
  }

  // An unknown project still gets the take logged, just without one.
  const projectId = await resolveProjectId(project ?? null).catch(() => null);
  let job;
  try {
    const published = await publishDataReferences(body, projectId);
    job = await (ark ? createVideoTask(published) : createVideoJob(published));
  } catch (err) {
    if (err instanceof MediaConfigError) {
      return NextResponse.json({ error: err.message }, { status: 500 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Generation request failed" },
      { status: 502 }
    );
  }

  // The job is already paid for, so a log failure mustn't fail the request.
  try {
    // The original body, so the log keeps the media as files, not tunnel URLs.
    await logSubmittedTake({ id: job.id, request: body, stage, project: projectId });
  } catch (err) {
    console.error(`Couldn't log take ${job.id}:`, err);
  }
  return NextResponse.json(job, { status: 202 });
}
