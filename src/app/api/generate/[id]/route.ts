import { after, NextResponse } from "next/server";
import { fetchVideoContent, pollVideoJob } from "@/lib/openrouter";
import { recordTakeResult } from "@/lib/takeLog";

const TERMINAL = ["completed", "failed", "cancelled", "expired"];

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  let status;
  try {
    status = await pollVideoJob(id);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Poll failed" },
      { status: 502 }
    );
  }

  if (TERMINAL.includes(status.status)) {
    const result = { status: status.status, cost: status.usage?.cost, error: status.error };
    // Saving the output means downloading the whole video; do it after the
    // response so the Studio isn't kept waiting on the log.
    after(async () => {
      try {
        await recordTakeResult(id, result, () => fetchVideoContent(id, 0));
      } catch (err) {
        // Takes from before logging existed have no record; that's fine.
        if ((err as NodeJS.ErrnoException).code !== "ENOENT") console.error(`Couldn't log result for take ${id}:`, err);
      }
    });
  }
  return NextResponse.json(status);
}
