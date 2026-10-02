import { NextResponse } from "next/server";
import { createMember, readRoster, toClientMember } from "@/lib/castStore";

export async function GET() {
  const roster = await readRoster();
  return NextResponse.json(roster.map(toClientMember));
}

export async function POST(req: Request) {
  const body = (await req.json()) as { name?: string };
  if (!body.name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  const member = await createMember(body.name);
  return NextResponse.json(toClientMember(member));
}
