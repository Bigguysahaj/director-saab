import { NextResponse } from "next/server";
import { createMember, readRoster, toClientMember } from "@/lib/castStore";
import { withProject } from "@/lib/projectStore";

// ?project=<id> picks the project; without it, the active one.
export async function GET(req: Request) {
  return withProject(req, async (projectId) => {
    const roster = await readRoster(projectId);
    return NextResponse.json(roster.map((m) => toClientMember(projectId, m)));
  });
}

export async function POST(req: Request) {
  return withProject(req, async (projectId) => {
    const body = (await req.json()) as { name?: string };
    if (!body.name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }
    const member = await createMember(projectId, body.name);
    return NextResponse.json(toClientMember(projectId, member));
  });
}
