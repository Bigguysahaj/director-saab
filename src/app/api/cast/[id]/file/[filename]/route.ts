import { NextResponse } from "next/server";
import { contentType } from "@/lib/dataUrl";
import { readMemberFile } from "@/lib/castStore";
import { withProject } from "@/lib/projectStore";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string; filename: string }> },
) {
  const { id, filename } = await params;
  // filename is only ever one we wrote ourselves (roster.json entries), but
  // guard against path traversal via a crafted URL regardless.
  if (filename.includes("/") || filename.includes("..")) {
    return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
  }

  return withProject(req, async (projectId) => {
    try {
      const buffer = await readMemberFile(projectId, id, filename);
      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          "Content-Type": contentType(filename),
          "Cache-Control": "private, max-age=3600",
        },
      });
    } catch {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
  });
}
