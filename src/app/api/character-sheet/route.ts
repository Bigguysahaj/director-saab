import { NextResponse } from "next/server";
import { generateImage, isConfigured } from "@/lib/openrouter";
import {
  CHARACTER_SHEET_COST_PER_IMAGE,
  CHARACTER_SHEET_MODEL,
  buildCharacterSheetGridPrompt,
} from "@/lib/characterSheet";

/**
 * Generates a full 9-shot character sheet as one grid image in a single
 * call — see characterSheet.ts for why that's cheaper than one call per
 * shot. The client crops the grid into individual shots.
 */
export async function POST(req: Request) {
  if (!isConfigured()) {
    return NextResponse.json(
      { error: "OPENROUTER_API_KEY is not configured on the server." },
      { status: 501 }
    );
  }

  const body = (await req.json()) as { photo?: string };
  if (!body.photo) {
    return NextResponse.json(
      { error: "photo (data URL) is required" },
      { status: 400 }
    );
  }

  try {
    const result = await generateImage({
      model: CHARACTER_SHEET_MODEL,
      prompt: buildCharacterSheetGridPrompt(),
      input_references: [{ type: "image_url", image_url: { url: body.photo } }],
    });
    const image = result.data?.[0];
    if (!image) throw new Error("No image returned");

    return NextResponse.json({
      image: `data:${image.media_type};base64,${image.b64_json}`,
      cost: CHARACTER_SHEET_COST_PER_IMAGE,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Image generation failed" },
      { status: 502 }
    );
  }
}
