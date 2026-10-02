import { NextResponse } from "next/server";
import { readMemberFile } from "@/lib/castStore";

const CONTENT_TYPE_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; filename: string }> }
) {
  const { id, filename } = await params;
  // filename is only ever one we wrote ourselves (roster.json entries), but
  // guard against path traversal via a crafted URL regardless.
  if (filename.includes("/") || filename.includes("..")) {
    return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
  }

  try {
    const buffer = await readMemberFile(id, filename);
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
