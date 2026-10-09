import type { ImageModel } from "./types";

/**
 * OpenRouter's live image-gen catalog (GET /images/models), normalized for
 * the "DoP" (Director of Photography) picker on /screen-test (ScreenTest.tsx)
 * — see /api/image-models/route.ts for the fetch + filtering.
 */

// Verified working (Muse Image 403s region-blocked from this dev IP, see
// the muse-image-region-block memory) — used whenever a request doesn't
// specify a model, and as the picker's default selection.
export const DEFAULT_IMAGE_MODEL_ID = "google/gemini-3.1-flash-lite-image";

/** Tolerates the live catalog's exact field shape drifting slightly. */
export function normalizeImageModel(raw: Record<string, unknown>): ImageModel {
  const id = String(raw.id ?? "");
  const rawName = String(raw.name ?? id);
  // OpenRouter names these "Provider: Model Name" — split on the first ": "
  // rather than hardcoding a provider table per id, since the catalog turns
  // over faster than that table could be kept in sync.
  const colonIdx = rawName.indexOf(": ");
  const provider = colonIdx === -1 ? (id.split("/")[0] ?? rawName) : rawName.slice(0, colonIdx);
  const label = colonIdx === -1 ? rawName : rawName.slice(colonIdx + 2);
  const description = String(raw.description ?? "");
  const tagline = description.split(/(?<=[.!?])\s/)[0]?.slice(0, 140) ?? "";
  const supportedParams = (raw.supported_parameters ?? {}) as Record<string, { max?: number } | undefined>;
  const maxInputReferences = supportedParams.input_references?.max ?? 0;
  return { id, label, provider, tagline, maxInputReferences };
}

// Shown when OPENROUTER_API_KEY isn't set, or the live catalog fetch fails —
// same reasoning as FALLBACK_MODELS in models.ts. All four are verified (as
// of 2026-09-25) to accept image input with room for a stage photo plus at
// least one cast reference.
export const FALLBACK_IMAGE_MODELS: ImageModel[] = [
  {
    id: DEFAULT_IMAGE_MODEL_ID,
    label: "Nano Banana 2 Lite (Gemini 3.1 Flash Lite Image)",
    provider: "Google",
    tagline: "Fast, cost-efficient — current default.",
    maxInputReferences: 14,
  },
  {
    id: "google/gemini-3-pro-image",
    label: "Nano Banana Pro (Gemini 3 Pro Image)",
    provider: "Google",
    tagline: "Higher-fidelity tier of the same family.",
    maxInputReferences: 14,
  },
  {
    id: "openai/gpt-image-1",
    label: "GPT Image 1",
    provider: "OpenAI",
    tagline: "OpenAI's general-purpose image model.",
    maxInputReferences: 16,
  },
  {
    id: "black-forest-labs/flux.2-pro",
    label: "FLUX.2 Pro",
    provider: "Black Forest Labs",
    tagline: "Strong prompt adherence for multi-reference composites.",
    maxInputReferences: 8,
  },
];
