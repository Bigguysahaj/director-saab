import "server-only";
import type {
  CreateJobResponse,
  GenerateRequest,
  ImageGenerateRequest,
  ImageGenerateResponse,
  PollJobResponse,
} from "./types";

const BASE_URL = "https://openrouter.ai/api/v1";

export function isConfigured(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY);
}

function headers(): HeadersInit {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) {
    throw new Error("OPENROUTER_API_KEY is not set");
  }
  return {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    "HTTP-Referer": process.env.OPENROUTER_SITE_URL || "http://localhost:3000",
    "X-Title": process.env.OPENROUTER_SITE_NAME || "Director",
  };
}

async function unwrap(res: Response, action: string) {
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenRouter ${action} failed (${res.status}): ${body}`);
  }
  return res.json();
}

export async function fetchVideoModelsRaw(): Promise<unknown> {
  const res = await fetch(`${BASE_URL}/videos/models`, {
    headers: headers(),
    next: { revalidate: 300 },
  });
  return unwrap(res, "list models");
}

export async function createVideoJob(
  body: GenerateRequest
): Promise<CreateJobResponse> {
  const res = await fetch(`${BASE_URL}/videos`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
  });
  return unwrap(res, "create video job");
}

export async function pollVideoJob(id: string): Promise<PollJobResponse> {
  const res = await fetch(`${BASE_URL}/videos/${id}`, {
    headers: headers(),
    cache: "no-store",
  });
  return unwrap(res, "poll video job");
}

export async function fetchVideoContent(
  id: string,
  index: number
): Promise<Response> {
  const res = await fetch(`${BASE_URL}/videos/${id}/content?index=${index}`, {
    headers: headers(),
  });
  if (!res.ok) {
    throw new Error(`OpenRouter content fetch failed (${res.status})`);
  }
  return res;
}

/**
 * Image generation is synchronous and all-or-nothing (unlike the video
 * jobs above): a call either returns finished images and is billed in
 * full, or it fails and isn't billed at all — no polling needed.
 */
export async function generateImage(
  body: ImageGenerateRequest
): Promise<ImageGenerateResponse> {
  const res = await fetch(`${BASE_URL}/images`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
  });
  return unwrap(res, "generate image");
}
