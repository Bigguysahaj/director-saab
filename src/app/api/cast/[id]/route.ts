import { NextResponse } from "next/server";
import { deleteMember, updateMember, toClientMember } from "@/lib/castStore";
import { withProject } from "@/lib/projectStore";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return withProject(req, async (projectId) => {
    const body = (await req.json()) as {
      name?: string;
      photo?: string; // data URL
      shots?: Record<string, { image: string; cost: number }>;
      stageColor?: string | null;
      sheet?: string; // data URL
      closeup?: string; // data URL
    };

    try {
      const member = await updateMember(projectId, id, {
        name: body.name,
        photoDataUrl: body.photo,
        shots: body.shots,
        stageColor: body.stageColor,
        sheetDataUrl: body.sheet,
        closeupDataUrl: body.closeup,
      });
      return NextResponse.json(toClientMember(projectId, member));
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Update failed" },
        { status: 404 },
      );
    }
  });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return withProject(req, async (projectId) => {
    await deleteMember(projectId, id);
    return NextResponse.json({ ok: true });
  });
}
