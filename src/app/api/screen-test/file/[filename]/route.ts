import { NextResponse } from "next/server";
import { readScreenTestFile } from "@/lib/screenTestStore";

const CONTENT_TYPE_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ filename: string }> }
) {
  const { filename } = await params;
  // filename is only ever "latest.<ext>" (see screenTestStore.ts), but
  // guard against path traversal via a crafted URL regardless.
  if (filename.includes("/") || filename.includes("..")) {
    return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
  }

  try {
    const buffer = await readScreenTestFile(filename);
    const ext = filename.split(".").pop() ?? "";
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": CONTENT_TYPE_BY_EXT[ext] ?? "application/octet-stream",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
