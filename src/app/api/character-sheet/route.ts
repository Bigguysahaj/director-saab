import { NextResponse } from "next/server";
import { generateImage, isConfigured } from "@/lib/openrouter";
import {
  MUSE_IMAGE_COST_PER_IMAGE,
  MUSE_IMAGE_MODEL,
  buildCharacterShotPrompt,
  getCharacterShot,
} from "@/lib/characterSheet";

/**
 * Generates one shot (one angle or expression) of a character sheet from a
 * reference photo. One shot per call, not the whole sheet at once — so a
 * future UI can regenerate a single cell without re-billing (or re-drifting)
 * the rest of the sheet. Always pass the original reference photo, never a
 * previously generated shot — see characterSheet.ts for why.
 */
export async function POST(req: Request) {
  if (!isConfigured()) {
    return NextResponse.json(
      { error: "OPENROUTER_API_KEY is not configured on the server." },
      { status: 501 }
    );
  }

  const body = (await req.json()) as { photo?: string; shotId?: string };
  const shot = body.shotId ? getCharacterShot(body.shotId) : undefined;
  if (!body.photo || !shot) {
    return NextResponse.json(
      { error: "photo (data URL) and a valid shotId are required" },
      { status: 400 }
    );
  }

  try {
    const result = await generateImage({
      model: MUSE_IMAGE_MODEL,
      prompt: buildCharacterShotPrompt(shot),
      input_references: [{ type: "image_url", image_url: { url: body.photo } }],
    });
    const image = result.data?.[0];
    if (!image) throw new Error("No image returned");

    return NextResponse.json({
      shotId: shot.id,
      image: `data:${image.media_type};base64,${image.b64_json}`,
      cost: MUSE_IMAGE_COST_PER_IMAGE,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Image generation failed" },
      { status: 502 }
    );
  }
}
