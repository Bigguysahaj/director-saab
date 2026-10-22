import { NextResponse } from "next/server";
import { MEDIA_FILE_RE, MIME_BY_EXT, readMediaFile } from "@/lib/mediaReference";
import { PROJECT_RE } from "@/lib/mediaStore";

// Public on purpose: OpenRouter fetches take references from here. Names are
// random UUIDs, so only someone handed a URL can read a file.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ project: string; filename: string }> }
) {
  const { project, filename } = await params;
  if (!PROJECT_RE.test(project) || !MEDIA_FILE_RE.test(filename)) {
    return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
  }
  try {
    const buffer = await readMediaFile(project, filename);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": MIME_BY_EXT[filename.split(".").pop()!] ?? "application/octet-stream",
        "Cache-Control": "public, max-age=86400, immutable",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
