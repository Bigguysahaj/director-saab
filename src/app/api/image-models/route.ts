import { NextResponse } from "next/server";
import { fetchImageModelsRaw, isConfigured } from "@/lib/openrouter";
import { DEFAULT_IMAGE_MODEL_ID, FALLBACK_IMAGE_MODELS, normalizeImageModel } from "@/lib/imageModels";

// Only models that take image input and accept at least this many reference
// images are useful for the "DoP" picker — a screen test needs a stage
// photo plus at least one cast member, so pure text-to-image models (most
// of the catalog) get filtered out here.
const MIN_INPUT_REFERENCES = 2;

export async function GET() {
  if (!isConfigured()) {
    return NextResponse.json({ models: FALLBACK_IMAGE_MODELS, default: DEFAULT_IMAGE_MODEL_ID, live: false });
  }

  try {
    const raw = await fetchImageModelsRaw();
    const list = Array.isArray((raw as { data?: unknown[] })?.data)
      ? (raw as { data: Record<string, unknown>[] }).data
      : [];
    const models = list
      .filter((m) => {
        const arch = (m.architecture ?? {}) as { input_modalities?: string[] };
        return arch.input_modalities?.includes("image") ?? false;
      })
      .map(normalizeImageModel)
      .filter((m) => m.id && m.maxInputReferences >= MIN_INPUT_REFERENCES);
    return NextResponse.json({
      models: models.length ? models : FALLBACK_IMAGE_MODELS,
      default: DEFAULT_IMAGE_MODEL_ID,
      live: models.length > 0,
    });
  } catch (err) {
    return NextResponse.json({
      models: FALLBACK_IMAGE_MODELS,
      default: DEFAULT_IMAGE_MODEL_ID,
      live: false,
      warning: err instanceof Error ? err.message : "Failed to reach OpenRouter",
    });
  }
}
