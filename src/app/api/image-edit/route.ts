import { NextResponse } from "next/server";
import { generateImage as generateOpenRouterImage, isConfigured } from "@/lib/openrouter";
import { generateImage as generateArkImage, isArkConfigured } from "@/lib/modelark";
import { DEFAULT_IMAGE_MODEL_ID, IMAGE_PRICE_PER_CALL } from "@/lib/imageModels";

/**
 * One paid edit of an existing image (a supplied character sheet today).
 * Knows nothing about cast, so generated shots or photos can use it later.
 */
export async function POST(req: Request) {
  const body = (await req.json()) as { image?: unknown; prompt?: unknown; model?: unknown };
  if (typeof body.image !== "string" || !body.image) {
    return NextResponse.json({ error: "image (data URL) is required" }, { status: 400 });
  }
  if (typeof body.prompt !== "string" || !body.prompt.trim()) {
    return NextResponse.json({ error: "prompt is required" }, { status: 400 });
  }
  if (body.model !== undefined && (typeof body.model !== "string" || !body.model)) {
    return NextResponse.json({ error: "model must be a non-empty string" }, { status: 400 });
  }
  const model = (body.model as string | undefined) ?? DEFAULT_IMAGE_MODEL_ID;
  const ark = model.startsWith("modelark/");
  if (ark ? !isArkConfigured() : !isConfigured()) {
    return NextResponse.json(
      { error: `${ark ? "ARK_API_KEY" : "OPENROUTER_API_KEY"} is not configured on the server.` },
      { status: 501 }
    );
  }

  try {
    const result = await (ark ? generateArkImage : generateOpenRouterImage)({
      model,
      prompt: `Edit this character sheet. Keep the layout, character identity and all other details unchanged. Change: ${body.prompt.trim()}`,
      input_references: [{ type: "image_url", image_url: { url: body.image } }],
    });
    const image = result.data?.[0];
    if (!image) throw new Error("No image returned");
    return NextResponse.json({
      image: `data:${image.media_type};base64,${image.b64_json}`,
      cost: result.usage?.cost ?? IMAGE_PRICE_PER_CALL[model] ?? null,
      model,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Image edit failed" }, { status: 502 });
  }
}
