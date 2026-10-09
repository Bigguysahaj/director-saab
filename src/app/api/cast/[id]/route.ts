import { NextResponse } from "next/server";
import { CastMemberNotFoundError, deleteMember, transferMember, updateMember, toClientMember } from "@/lib/castStore";
import { ProjectNotFoundError, withProject } from "@/lib/projectStore";

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

/** { targetProjectId, mode } copies or moves this member, including disk images. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withProject(req, async (projectId) => {
    let body;
    try { body = await req.json(); } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
    if (typeof body?.targetProjectId !== "string" || !body.targetProjectId || (body.mode !== "copy" && body.mode !== "move")) {
      return NextResponse.json({ error: "Destination project and copy/move mode are required" }, { status: 400 });
    }
    if (body.targetProjectId === projectId) return NextResponse.json({ error: "Choose a different destination project" }, { status: 400 });
    try {
      const member = await transferMember(projectId, id, body.targetProjectId, body.mode);
      return NextResponse.json(toClientMember(body.targetProjectId, member), { status: 201 });
    } catch (err) {
      const missing = err instanceof ProjectNotFoundError || err instanceof CastMemberNotFoundError;
      return NextResponse.json({ error: missing ? (err as Error).message : "Transfer failed" }, { status: missing ? 404 : 500 });
    }
  });
}
