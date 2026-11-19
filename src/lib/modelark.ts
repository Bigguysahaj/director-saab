import "server-only";
import type {
  CreateJobResponse,
  GenerateRequest,
  GenerationStatus,
  ImageGenerateRequest,
  ImageGenerateResponse,
  PollJobResponse,
} from "./types";

const BASE_URL = "https://ark.ap-southeast.bytepluses.com/api/v3";
const MODEL_PREFIX = "modelark/";

const IMAGE_PRICES: Record<string, number> = {
  "dola-seedream-5-0-flash-260915": 0.018,
  "seedream-5-0-lite-260128": 0.035,
  "seedream-4-5-251128": 0.04,
  "dola-seedream-5-0-pro-260628": 0.045,
};

// Our job ids for ModelArk tasks carry this prefix so the poll and content
// routes know where to send them. "-", not ":", because take ids are folder
// names and takeLog.ts only allows [A-Za-z0-9_-].
const JOB_PREFIX = "ark-";

// USD per output token (BytePlus price page, 2026-11-15).
const VIDEO_TOKEN_RATES: Record<string, number> = {
  "dreamina-seedance-2-5-flash-261115": 0.000007,
};

export function isArkJob(id: string): boolean {
  return id.startsWith(JOB_PREFIX);
}

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

type ArkError = { code?: string; message?: string };
type ArkTask = {
  id?: string;
  model?: string;
  status?: string;
  content?: { video_url?: string };
  usage?: { completion_tokens?: number };
  error?: ArkError;
};

function arkKey(): string {
  const key = process.env.ARK_API_KEY;
  if (!key) throw new Error("ARK_API_KEY is not configured");
  return key;
}

async function arkJson(res: Response, what: string): Promise<ArkTask> {
  let payload: ArkTask;
  try {
    payload = (await res.json()) as ArkTask;
  } catch {
    throw new Error(`ModelArk ${what} failed (${res.status}): invalid response`);
  }
  if (!res.ok || (payload.error && !payload.status)) {
    throw new Error(`ModelArk ${what} failed (${res.status}): ${arkError(payload.error)}`);
  }
  return payload;
}

const REFERENCE_ROLES = { image_url: "reference_image", video_url: "reference_video", audio_url: "reference_audio" } as const;

export async function createVideoTask(body: GenerateRequest): Promise<CreateJobResponse> {
  if (!body.model.startsWith(MODEL_PREFIX)) throw new Error("Expected a modelark/ video model");
  const key = arkKey();
  const content = [
    { type: "text", text: body.prompt },
    ...(body.frame_images ?? []).map((f) => ({ type: "image_url", image_url: f.image_url, role: f.frame_type })),
    ...(body.input_references ?? []).map((r) => ({ ...r, role: REFERENCE_ROLES[r.type] })),
  ];
  const res = await fetch(`${BASE_URL}/contents/generations/tasks`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: body.model.slice(MODEL_PREFIX.length),
      content,
      resolution: body.resolution,
      ratio: body.aspect_ratio,
      duration: body.duration,
      seed: body.seed,
      generate_audio: body.generate_audio,
      watermark: false,
    }),
  });
  const task = await arkJson(res, "video generation");
  if (!task.id) throw new Error("ModelArk video generation returned no task id");
  return { id: JOB_PREFIX + task.id, polling_url: "", status: "pending" };
}

function toStatus(arkStatus: string | undefined): GenerationStatus {
  // TODO(human)
}

async function getTask(id: string): Promise<ArkTask> {
  if (!isArkJob(id)) throw new Error(`Not a ModelArk job: ${id}`);
  const res = await fetch(`${BASE_URL}/contents/generations/tasks/${encodeURIComponent(id.slice(JOB_PREFIX.length))}`, {
    headers: { Authorization: `Bearer ${arkKey()}` },
    cache: "no-store",
  });
  return arkJson(res, "task poll");
}

export async function pollVideoTask(id: string): Promise<PollJobResponse> {
  const task = await getTask(id);
  const status = toStatus(task.status);
  const rate = task.model ? VIDEO_TOKEN_RATES[task.model] : undefined;
  const tokens = task.usage?.completion_tokens;
  return {
    id,
    status,
    error: task.error ? arkError(task.error) : undefined,
    unsigned_urls: task.content?.video_url ? [task.content.video_url] : undefined,
    usage: rate !== undefined && tokens !== undefined ? { cost: tokens * rate } : undefined,
  };
}

// ModelArk's video_url expires after 24h; the take log saves a copy on
// completion, so this only has to work while the take is fresh.
export async function fetchVideoTaskContent(id: string): Promise<Response> {
  const task = await getTask(id);
  const url = task.content?.video_url;
  if (task.status !== "succeeded" || !url) throw new Error(`ModelArk task ${id} has no video yet`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`ModelArk video download failed (${res.status})`);
  return res;
}
