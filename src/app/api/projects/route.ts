import { NextResponse } from "next/server";
import { createProject, listProjects, ProjectNotFoundError, setActiveProject } from "@/lib/projectStore";

export async function GET() {
  return NextResponse.json(await listProjects());
}

/** Creates a project and makes it active. 400 for an empty or taken name. */
export async function POST(req: Request) {
  const body = (await req.json()) as { name?: string };
  try {
    return NextResponse.json(await createProject(body.name ?? ""), { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Create failed" }, { status: 400 });
  }
}

/** Switches the active project: { activeId }. */
export async function PATCH(req: Request) {
  const body = (await req.json()) as { activeId?: string };
  try {
    return NextResponse.json(await setActiveProject(body.activeId ?? ""));
  } catch (err) {
    if (err instanceof ProjectNotFoundError) return NextResponse.json({ error: err.message }, { status: 404 });
    throw err;
  }
}
