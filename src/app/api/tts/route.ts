import { NextResponse } from "next/server";
import { isElevenLabsConfigured, MAX_TTS_CHARS, textToSpeech } from "@/lib/elevenlabs";

export async function POST(req: Request) {
  let body: { text?: unknown; voiceId?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body" }, { status: 400 });
  }
  const { text, voiceId } = body ?? {};
  if (typeof text !== "string" || !text.trim()) return NextResponse.json({ error: "text is required" }, { status: 400 });
  if (text.length > MAX_TTS_CHARS) return NextResponse.json({ error: `text is over ${MAX_TTS_CHARS} characters` }, { status: 400 });
  if (typeof voiceId !== "string" || !voiceId) return NextResponse.json({ error: "voiceId is required" }, { status: 400 });
  if (!isElevenLabsConfigured()) return NextResponse.json({ error: "ELEVENLABS_API_KEY is not set in .env.local" }, { status: 503 });

  try {
    const audio = await textToSpeech(text, voiceId);
    return new Response(audio, { headers: { "Content-Type": "audio/mpeg" } });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Text-to-speech failed" }, { status: 502 });
  }
}
