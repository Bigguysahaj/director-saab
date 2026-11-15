import "server-only";

const BASE_URL = "https://api.elevenlabs.io/v1";
// v3 reads inline audio tags like [whispering]; ENG-040 builds on that.
export const TTS_MODEL_ID = "eleven_v3";
export const MAX_TTS_CHARS = 500;

export type Voice = { id: string; name: string };

export function isElevenLabsConfigured(): boolean {
  return Boolean(process.env.ELEVENLABS_API_KEY);
}

function apiKey(): string {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error("ELEVENLABS_API_KEY is not configured");
  return key;
}

async function failure(res: Response, what: string): Promise<Error> {
  let detail = "";
  try {
    const body = (await res.json()) as { detail?: string | { message?: string; status?: string } };
    detail = typeof body.detail === "string" ? body.detail : body.detail?.message ?? body.detail?.status ?? "";
  } catch {}
  return new Error(`ElevenLabs ${what} failed (${res.status})${detail ? `: ${detail}` : ""}`);
}

export async function textToSpeech(text: string, voiceId: string): Promise<ArrayBuffer> {
  const key = apiKey();
  const res = await fetch(`${BASE_URL}/text-to-speech/${encodeURIComponent(voiceId)}`, {
    method: "POST",
    headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify({ text, model_id: TTS_MODEL_ID }),
  });
  if (!res.ok) throw await failure(res, "text-to-speech");
  return res.arrayBuffer();
}

export async function listVoices(): Promise<Voice[]> {
  const res = await fetch(`${BASE_URL}/voices`, { headers: { "xi-api-key": apiKey() } });
  if (!res.ok) throw await failure(res, "voice list");
  const body = (await res.json()) as { voices?: { voice_id: string; name: string }[] };
  return (body.voices ?? []).map((v) => ({ id: v.voice_id, name: v.name }));
}
