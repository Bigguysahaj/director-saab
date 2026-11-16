import { NextResponse } from "next/server";
import { imageProvider } from "@/lib/imageProvider";
import { buildCharacterSheetGridPrompt } from "@/lib/characterSheet";
import { DEFAULT_IMAGE_MODEL_ID, IMAGE_PRICE_PER_CALL } from "@/lib/imageModels";

/**
 * Generates a full 9-shot character sheet as one grid image in a single
 * call — see characterSheet.ts for why that's cheaper than one call per
 * shot. The client crops the grid into individual shots.
 */
export async function POST(req: Request) {
  const body = (await req.json()) as { photo?: string; model?: unknown };
  if (!body.photo) {
    return NextResponse.json(
      { error: "photo (data URL) is required" },
      { status: 400 }
    );
  }
  if (body.model !== undefined && (typeof body.model !== "string" || !body.model)) {
    return NextResponse.json({ error: "model must be a non-empty string" }, { status: 400 });
  }
  const model = (body.model as string | undefined) ?? DEFAULT_IMAGE_MODEL_ID;
  const generate = imageProvider(model);
  if (generate instanceof Response) return generate;

  try {
    const result = await generate({
      model,
      prompt: buildCharacterSheetGridPrompt(),
      input_references: [{ type: "image_url", image_url: { url: body.photo } }],
    });
    const image = result.data?.[0];
    if (!image) throw new Error("No image returned");

    return NextResponse.json({
      image: `data:${image.media_type};base64,${image.b64_json}`,
      cost: result.usage?.cost ?? IMAGE_PRICE_PER_CALL[model] ?? null,
      model,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Image generation failed" },
      { status: 502 }
    );
  }
}
