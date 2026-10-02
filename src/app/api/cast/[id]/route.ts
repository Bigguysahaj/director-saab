import { NextResponse } from "next/server";
import { deleteMember, updateMember, toClientMember } from "@/lib/castStore";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = (await req.json()) as {
    name?: string;
    photo?: string; // data URL
    shots?: Record<string, { image: string; cost: number }>;
    stageColor?: string | null;
  };

  try {
    const member = await updateMember(id, {
      name: body.name,
      photoDataUrl: body.photo,
      shots: body.shots,
      stageColor: body.stageColor,
    });
    return NextResponse.json(toClientMember(member));
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Update failed" },
      { status: 404 }
    );
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await deleteMember(id);
  return NextResponse.json({ ok: true });
}
