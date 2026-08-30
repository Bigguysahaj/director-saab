import { NextResponse } from "next/server";
import { fetchVideoContent } from "@/lib/openrouter";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const index = Number(new URL(req.url).searchParams.get("index") ?? "0");

  try {
    const upstream = await fetchVideoContent(id, index);
    return new NextResponse(upstream.body, {
      headers: {
        "Content-Type": upstream.headers.get("content-type") ?? "video/mp4",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Content fetch failed" },
      { status: 502 }
    );
  }
}
