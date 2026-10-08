import { NextResponse } from "next/server";
import { setKept } from "@/lib/takeLog";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = (await req.json()) as { kept?: unknown };
  if (typeof body.kept !== "boolean") {
    return NextResponse.json({ error: "kept must be true or false" }, { status: 400 });
  }
  try {
    await setKept(id, body.kept);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Take not found" }, { status: 404 });
  }
}
