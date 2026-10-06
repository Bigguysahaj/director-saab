import type { VideoModel } from "./types";

// Human framing for known model slugs. Anything OpenRouter adds later still
// renders correctly via deriveMeta() below — this table just makes the
// familiar ones read nicer.
const KNOWN_META: Record<
  string,
  { label: string; provider: string; tagline: string }
> = {
  "bytedance/seedance-2.5": {
    label: "Seedance 2.5",
    provider: "ByteDance",
    tagline: "Long-form storytelling, up to 50 reference assets",
  },
  "bytedance/seedance-2.0": {
    label: "Seedance 2.0",
    provider: "ByteDance",
    tagline: "Character consistency across shots",
  },
  "bytedance/seedance-2.0-mini": {
    label: "Seedance 2.0 Mini",
    provider: "ByteDance",
    tagline: "Fast multimodal reference-to-video",
  },
  "bytedance/seedance-2.0-fast": {
    label: "Seedance 2.0 Fast",
    provider: "ByteDance",
    tagline: "Speed and cost over max fidelity",
  },
  "bytedance/seedance-1-5-pro": {
    label: "Seedance 1.5 Pro",
    provider: "ByteDance",
    tagline: "Simultaneous video + lip-synced audio",
  },
  "google/veo-3.1": {
    label: "Veo 3.1",
    provider: "Google",
    tagline: "Cinematic fidelity with native audio",
  },
  "google/veo-3.1-lite": {
    label: "Veo 3.1 Lite",
    provider: "Google",
    tagline: "Synchronized audio at reduced cost",
  },
  "google/veo-3.1-fast": {
    label: "Veo 3.1 Fast",
    provider: "Google",
    tagline: "Frame-conditioned, mid-tier turnaround",
  },
  "minimax/hailuo-3": {
    label: "Hailuo 3",
    provider: "MiniMax",
    tagline: "Instruction-guided edits, motion transfer",
  },
  "alibaba/wan-2.7": {
    label: "Wan 2.7",
    provider: "Alibaba",
    tagline: "Image- and reference-to-video",
  },
  "x-ai/grok-imagine-video": {
    label: "Grok Imagine Video",
    provider: "xAI",
    tagline: "Text, image, or reference conditioned",
  },
  "x-ai/grok-imagine-video-1.5": {
    label: "Grok Imagine Video 1.5",
    provider: "xAI",
    tagline: "Synchronized sound effects and dialogue",
  },
};

function deriveMeta(id: string) {
  const known = KNOWN_META[id];
  if (known) return known;
  const [providerSlug, ...rest] = id.split("/");
  const provider = providerSlug
    .split("-")
    .map((w) => w[0]?.toUpperCase() + w.slice(1))
    .join(" ");
  const label = (rest.join("/") || id)
    .split("-")
    .map((w) => (w[0]?.toUpperCase() || "") + w.slice(1))
    .join(" ");
  return { label, provider, tagline: "" };
}

function boolField(raw: Record<string, unknown>, keys: string[]): boolean {
  for (const key of keys) {
    const val = raw[key];
    if (typeof val === "boolean") return val;
    if (Array.isArray(val)) return val.length > 0;
  }
  return false;
}

/**
 * OpenRouter's live catalog prices via a `pricing_skus` map whose keys vary
 * per provider (flat per-second rates in dollars, cents-denominated rates,
 * or per-token/per-megapixel rates that aren't expressible as $/s at all).
 * We surface the cheapest genuinely per-second SKU as a "from" price and
 * ignore per-token, per-image, and per-generation SKUs since they can't be
 * converted to $/s without knowing token/image counts.
 */
function derivePricePerSecond(raw: Record<string, unknown>): number | undefined {
  const skus = raw.pricing_skus as Record<string, string> | undefined;
  if (!skus || typeof skus !== "object") return undefined;

  let min: number | undefined;
  for (const [key, value] of Object.entries(skus)) {
    if (!key.includes("second") || key.includes("megapixel")) continue;
    const n = Number(value);
    if (!Number.isFinite(n)) continue;
    const perSecond = key.startsWith("cents_") ? n / 100 : n;
    if (min === undefined || perSecond < min) min = perSecond;
  }
  return min;
}

/**
 * Seedance prices per token, with a separate (cheaper) rate once a video
 * reference is attached; derivePricePerSecond ignores both. The SKU naming
 * isn't documented, so: any "token" key, "video" in it marks the
 * video-input rate, and a "million"-denominated key (or a value too large
 * to be per-token) is scaled down to USD per token.
 */
function deriveTokenRates(raw: Record<string, unknown>): { token_rate?: number; video_input_token_rate?: number } {
  const skus = raw.pricing_skus as Record<string, string> | undefined;
  if (!skus || typeof skus !== "object") return {};
  const out: { token_rate?: number; video_input_token_rate?: number } = {};
  for (const [key, value] of Object.entries(skus)) {
    if (!key.includes("token")) continue;
    let n = Number(value);
    if (!Number.isFinite(n) || n <= 0) continue;
    if (key.includes("million") || n >= 0.01) n /= 1_000_000;
    const field = key.includes("video") ? "video_input_token_rate" : "token_rate";
    out[field] = Math.min(out[field] ?? Infinity, n);
  }
  return out;
}

// Research (OpenRouter openapi, 2026-10) says Seedance 2.x takes video and
// audio refs and 1.5 doesn't. Prefer an explicit catalog list when there is
// one; otherwise fall back to that.
function supportsVideoReference(id: string, raw: Record<string, unknown>): boolean {
  for (const key of ["supported_input_reference_types", "input_reference_types", "supported_input_modalities"]) {
    const val = raw[key];
    if (Array.isArray(val)) return val.some((t) => String(t).includes("video"));
  }
  return /^bytedance\/seedance-2/.test(id);
}

/** Tolerates minor field-naming drift in OpenRouter's live catalog response. */
export function normalizeModel(raw: Record<string, unknown>): VideoModel {
  const id = String(raw.id ?? raw.model ?? "");
  const meta = deriveMeta(id);
  return {
    id,
    label: meta.label,
    provider: meta.provider,
    tagline: meta.tagline,
    supported_durations: (raw.supported_durations as number[]) ?? [],
    supported_resolutions: (raw.supported_resolutions as string[]) ?? [],
    supported_aspect_ratios: (raw.supported_aspect_ratios as string[]) ?? [],
    supports_audio: boolField(raw, ["supports_audio", "supports_generate_audio"]),
    supports_seed: boolField(raw, ["supports_seed"]),
    supports_frame_images: boolField(raw, [
      "supports_frame_images",
      "supported_frame_images",
    ]),
    supports_input_references: boolField(raw, [
      "supports_input_references",
      "supported_input_references",
    ]),
    price_per_second:
      typeof raw.price_per_second === "number"
        ? raw.price_per_second
        : derivePricePerSecond(raw),
    supports_video_reference: supportsVideoReference(id, raw),
    ...deriveTokenRates(raw),
  };
}

// Shown when OPENROUTER_API_KEY isn't set yet, so the studio still renders
// and can be explored before wiring up a real key.
export const FALLBACK_MODELS: VideoModel[] = [
  {
    id: "bytedance/seedance-2.5",
    ...KNOWN_META["bytedance/seedance-2.5"],
    supported_durations: [4, 6, 8, 10, 12, 16, 20, 24, 30],
    supported_resolutions: ["480p", "720p", "4K"],
    supported_aspect_ratios: ["16:9", "4:3", "1:1", "3:4", "9:16", "21:9"],
    supports_audio: true,
    supports_seed: true,
    supports_frame_images: true,
    supports_input_references: true,
    price_per_second: 0.1028,
    supports_video_reference: true,
  },
  {
    id: "bytedance/seedance-2.0-mini",
    ...KNOWN_META["bytedance/seedance-2.0-mini"],
    supported_durations: [4, 6, 8, 10, 12, 15],
    supported_resolutions: ["480p", "720p"],
    supported_aspect_ratios: ["16:9", "9:16", "1:1"],
    supports_audio: true,
    supports_seed: true,
    supports_frame_images: true,
    supports_input_references: true,
    price_per_second: 0.01345,
    supports_video_reference: true,
    // OpenRouter catalog, 2026-10-07 (USD per token).
    token_rate: 0.0000035,
    video_input_token_rate: 0.0000021,
  },
  {
    id: "bytedance/seedance-2.0-fast",
    ...KNOWN_META["bytedance/seedance-2.0-fast"],
    supported_durations: [4, 6, 8, 10],
    supported_resolutions: ["480p", "720p"],
    supported_aspect_ratios: ["16:9", "9:16", "1:1"],
    supports_audio: false,
    supports_seed: true,
    supports_frame_images: true,
    supports_input_references: false,
    price_per_second: 0.02,
    supports_video_reference: true,
  },
  {
    id: "google/veo-3.1",
    ...KNOWN_META["google/veo-3.1"],
    supported_durations: [4, 6, 8],
    supported_resolutions: ["720p", "1080p"],
    supported_aspect_ratios: ["16:9", "9:16", "1:1"],
    supports_audio: true,
    supports_seed: false,
    supports_frame_images: true,
    supports_input_references: false,
    price_per_second: 0.5,
    supports_video_reference: false,
  },
  {
    id: "google/veo-3.1-lite",
    ...KNOWN_META["google/veo-3.1-lite"],
    supported_durations: [4, 6, 8],
    supported_resolutions: ["720p"],
    supported_aspect_ratios: ["16:9", "9:16"],
    supports_audio: true,
    supports_seed: false,
    supports_frame_images: true,
    supports_input_references: false,
    price_per_second: 0.2,
    supports_video_reference: false,
  },
  {
    id: "minimax/hailuo-3",
    ...KNOWN_META["minimax/hailuo-3"],
    supported_durations: [5],
    supported_resolutions: ["720p", "1080p", "2K"],
    supported_aspect_ratios: ["16:9"],
    supports_audio: true,
    supports_seed: false,
    supports_frame_images: true,
    supports_input_references: true,
    price_per_second: 0.15,
    supports_video_reference: false,
  },
  {
    id: "alibaba/wan-2.7",
    ...KNOWN_META["alibaba/wan-2.7"],
    supported_durations: [5, 8],
    supported_resolutions: ["480p", "720p"],
    supported_aspect_ratios: ["16:9", "9:16", "1:1"],
    supports_audio: false,
    supports_seed: true,
    supports_frame_images: true,
    supports_input_references: true,
    price_per_second: 0.08,
    supports_video_reference: false,
  },
];
