import { NextResponse } from "next/server";
import { generateImage, isConfigured } from "@/lib/openrouter";
import { SCREEN_TEST_COST_PER_IMAGE, buildScreenTestPrompt, type ScreenTestCastRef } from "@/lib/screenTest";
import { DEFAULT_IMAGE_MODEL_ID } from "@/lib/imageModels";
import { readLatestScreenTest, saveScreenTest, toClientScreenTest } from "@/lib/screenTestStore";

/** Returns the last-generated Screen Test composite, if any, so /screen-test
 * can show it again after a refresh without re-generating. */
export async function GET() {
  const latest = await readLatestScreenTest();
  return NextResponse.json(latest ? toClientScreenTest(latest) : null);
}

/**
 * Composites a captured /stage photo with the reference photo of whichever
 * cast member is assigned to each color-coded mannequin — see screenTest.ts
 * for the prompt this builds and CastPanel.tsx for how a mannequin's color
 * ends up on a cast member in the first place.
 */
export async function POST(req: Request) {
  if (!isConfigured()) {
    return NextResponse.json(
      { error: "OPENROUTER_API_KEY is not configured on the server." },
      { status: 501 }
    );
  }

  const body = (await req.json()) as {
    stagePhoto?: string; // data URL
    cast?: (ScreenTestCastRef & { photo: string })[]; // photo: data URL
    model?: string; // OpenRouter image-model id — see the DoP picker in ScreenTest.tsx
  };
  if (!body.stagePhoto) {
    return NextResponse.json({ error: "stagePhoto (data URL) is required" }, { status: 400 });
  }
  const cast = body.cast ?? [];
  if (cast.length === 0) {
    return NextResponse.json({ error: "at least one cast assignment is required" }, { status: 400 });
  }

  try {
    const result = await generateImage({
      model: body.model || DEFAULT_IMAGE_MODEL_ID,
      prompt: buildScreenTestPrompt(cast),
      input_references: [
        { type: "image_url", image_url: { url: body.stagePhoto } },
        ...cast.map((c) => ({ type: "image_url" as const, image_url: { url: c.photo } })),
      ],
    });
    const image = result.data?.[0];
    if (!image) throw new Error("No image returned");

    // Different models bill differently — use the actual reported cost when
    // OpenRouter includes one, falling back to the known-good estimate for
    // the default model only when it doesn't.
    const saved = await saveScreenTest(
      `data:${image.media_type};base64,${image.b64_json}`,
      result.usage?.cost ?? SCREEN_TEST_COST_PER_IMAGE
    );
    return NextResponse.json(toClientScreenTest(saved));
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Image generation failed" },
      { status: 502 }
    );
  }
}
