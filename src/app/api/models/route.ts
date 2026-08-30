import { NextResponse } from "next/server";
import { fetchVideoModelsRaw, isConfigured } from "@/lib/openrouter";
import { FALLBACK_MODELS, normalizeModel } from "@/lib/models";

export async function GET() {
  if (!isConfigured()) {
    return NextResponse.json({ models: FALLBACK_MODELS, live: false });
  }

  try {
    const raw = await fetchVideoModelsRaw();
    const list = Array.isArray((raw as { data?: unknown[] })?.data)
      ? (raw as { data: Record<string, unknown>[] }).data
      : [];
    const models = list.map(normalizeModel).filter((m) => m.id);
    return NextResponse.json({
      models: models.length ? models : FALLBACK_MODELS,
      live: models.length > 0,
    });
  } catch (err) {
    return NextResponse.json({
      models: FALLBACK_MODELS,
      live: false,
      warning: err instanceof Error ? err.message : "Failed to reach OpenRouter",
    });
  }
}
