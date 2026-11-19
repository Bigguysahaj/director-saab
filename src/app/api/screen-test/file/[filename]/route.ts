import { NextResponse } from "next/server";
import { contentType } from "@/lib/dataUrl";
import { readScreenTestFile } from "@/lib/screenTestStore";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ filename: string }> }
) {
  const { filename } = await params;
  // Filenames come from screenTestStore.ts, but guard against path
  // traversal via a crafted URL regardless.
  if (filename.includes("/") || filename.includes("..")) {
    return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
  }

  try {
    const buffer = await readScreenTestFile(filename);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": contentType(filename),
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
