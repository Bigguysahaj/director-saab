import { NextResponse } from "next/server";
import { isArkConfigured } from "@/lib/modelark";
import { fetchVideoModelsRaw, isConfigured } from "@/lib/openrouter";
import { ARK_VIDEO_MODELS, FALLBACK_MODELS, normalizeModel } from "@/lib/models";

export async function GET() {
  const ark = isArkConfigured() ? ARK_VIDEO_MODELS : [];
  if (!isConfigured()) {
    return NextResponse.json({ models: [...FALLBACK_MODELS, ...ark], live: false });
  }

  try {
    const raw = await fetchVideoModelsRaw();
    const list = Array.isArray((raw as { data?: unknown[] })?.data)
      ? (raw as { data: Record<string, unknown>[] }).data
      : [];
    const models = list.map(normalizeModel).filter((m) => m.id);
    return NextResponse.json({
      models: [...(models.length ? models : FALLBACK_MODELS), ...ark],
      live: models.length > 0,
    });
  } catch (err) {
    return NextResponse.json({
      models: [...FALLBACK_MODELS, ...ark],
      live: false,
      warning: err instanceof Error ? err.message : "Failed to reach OpenRouter",
    });
  }
}
