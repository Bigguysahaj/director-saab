import { NextResponse } from "next/server";
import { pollVideoJob } from "@/lib/openrouter";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const status = await pollVideoJob(id);
    return NextResponse.json(status);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Poll failed" },
      { status: 502 }
    );
  }
}
