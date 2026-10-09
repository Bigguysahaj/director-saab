import { NextResponse } from "next/server";
import { createProject, deleteProject, listProjects, ProjectNotFoundError, renameProject, setActiveProject } from "@/lib/projectStore";

export async function GET() {
  return NextResponse.json(await listProjects());
}

function failure(err: unknown) {
  return NextResponse.json({ error: err instanceof Error ? err.message : "Project update failed" }, {
    status: err instanceof ProjectNotFoundError ? 404 : 400,
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (typeof body?.name !== "string") throw new Error("Project name is required");
    return NextResponse.json(await createProject(body.name), { status: 201 });
  } catch (err) { return failure(err); }
}

/** { activeId } switches projects; { id, name } renames a project. */
export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    if (typeof body?.activeId === "string") return NextResponse.json(await setActiveProject(body.activeId));
    if (typeof body?.id !== "string" || typeof body?.name !== "string") throw new Error("Project id and name are required");
    return NextResponse.json(await renameProject(body.id, body.name));
  } catch (err) { return failure(err); }
}

export async function DELETE(req: Request) {
  try {
    const body = await req.json();
    if (typeof body?.id !== "string" || !body.id) throw new Error("Project id is required");
    return NextResponse.json(await deleteProject(body.id));
  } catch (err) { return failure(err); }
}
