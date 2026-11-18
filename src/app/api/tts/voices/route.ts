import { NextResponse } from "next/server";
import { isElevenLabsConfigured, listVoices } from "@/lib/elevenlabs";

export async function GET() {
  if (!isElevenLabsConfigured()) return NextResponse.json({ error: "ELEVENLABS_API_KEY is not set in .env.local" }, { status: 503 });
  try {
    return NextResponse.json(await listVoices());
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Couldn't list voices" }, { status: 502 });
  }
}
