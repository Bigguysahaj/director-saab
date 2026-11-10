import "server-only";
import type { ImageGenerateRequest, ImageGenerateResponse } from "./types";

const BASE_URL = "https://ark.ap-southeast.bytepluses.com/api/v3";
const MODEL_PREFIX = "modelark/";

const IMAGE_PRICES: Record<string, number> = {
  "dola-seedream-5-0-flash-260915": 0.018,
  "seedream-5-0-lite-260128": 0.035,
  "seedream-4-5-251128": 0.04,
  "dola-seedream-5-0-pro-260628": 0.045,
};

export function isArkConfigured(): boolean {
  return Boolean(process.env.ARK_API_KEY);
}

type ArkImage = { b64_json?: string; size?: string };
type ArkImageResponse = {
  data?: ArkImage[];
  usage?: { generated_images?: number };
  error?: { code?: string; message?: string };
};

function imagePrice(model: string, size?: string): number {
  const price = IMAGE_PRICES[model];
  if (price === undefined) throw new Error(`Unknown ModelArk image model: ${model}`);
  if (model === "dola-seedream-5-0-pro-260628" && size) {
    const match = /^(\d+)x(\d+)$/.exec(size);
    if (match && Number(match[1]) * Number(match[2]) > 2_600_000) return 0.09;
  }
  return price;
}

function arkError(error: ArkImageResponse["error"]): string {
  return [error?.code, error?.message].filter(Boolean).join(": ") || "unknown error";
}

export async function generateImage(body: ImageGenerateRequest): Promise<ImageGenerateResponse> {
  const key = process.env.ARK_API_KEY;
  if (!key) throw new Error("ARK_API_KEY is not configured");
  if (!body.model.startsWith(MODEL_PREFIX)) throw new Error("Expected a modelark/ image model");
  const model = body.model.slice(MODEL_PREFIX.length);
  imagePrice(model);

  const image = (body.input_references ?? []).map((reference) => {
    if (reference.type !== "image_url") throw new Error("ModelArk image generation accepts image references only");
    return reference.image_url.url;
  });

  const res = await fetch(`${BASE_URL}/images/generations`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      prompt: body.prompt,
      image,
      response_format: "b64_json",
      watermark: false,
      size: "2K",
    }),
  });
  let payload: ArkImageResponse;
  try {
    payload = (await res.json()) as ArkImageResponse;
  } catch {
    throw new Error(`ModelArk image generation failed (${res.status}): invalid response`);
  }
  if (!res.ok || payload.error) {
    throw new Error(`ModelArk image generation failed (${res.status}): ${arkError(payload.error)}`);
  }
  if (!payload.data?.length || payload.data.some((item) => !item.b64_json)) {
    throw new Error("ModelArk image generation returned no image");
  }
  const count = payload.usage?.generated_images ?? payload.data.length;
  const cost = count === payload.data.length
    ? payload.data.reduce((sum, item) => sum + imagePrice(model, item.size), 0)
    : count * imagePrice(model, payload.data[0].size);
  return {
    data: payload.data.map((item) => ({ b64_json: item.b64_json!, media_type: "image/jpeg" })),
    usage: { cost },
  };
}
