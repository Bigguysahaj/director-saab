import { NextResponse } from "next/server";
import { generateImage as generateOpenRouterImage, isConfigured } from "@/lib/openrouter";
import { generateImage as generateArkImage, isArkConfigured } from "@/lib/modelark";
import { buildScenePrompt, buildScreenTestPrompt } from "@/lib/screenTest";
import { DEFAULT_IMAGE_MODEL_ID, IMAGE_PRICE_PER_CALL } from "@/lib/imageModels";
import { listScreenTests, saveScreenTest, toClientScreenTest } from "@/lib/screenTestStore";

/** Screen Test history, newest first. */
export async function GET() {
  return NextResponse.json((await listScreenTests()).map(toClientScreenTest));
}

type CastIn = { name?: unknown; colorLabel?: unknown; images?: unknown };

const bad = (error: string) => NextResponse.json({ error }, { status: 400 });

/**
 * One paid image per call, three ways in:
 * - edit: a dropped `image` + `prompt`
 * - cast: `cast` members (+ optional scene `image`) + `prompt`
 * - stage: a /stage `stagePhoto` + the cast assigned to its mannequins (see
 *   screenTest.ts), with the owner's `prompt` appended if given.
 * The client checks the model's reference cap; the server has no live catalog.
 */
export async function POST(req: Request) {
  const body = (await req.json()) as {
    prompt?: unknown;
    image?: unknown; // data URL
    stagePhoto?: unknown; // data URL
    cast?: CastIn[];
    model?: string;
  };
  const model = body.model || DEFAULT_IMAGE_MODEL_ID;
  const ark = model.startsWith("modelark/");
  if (ark ? !isArkConfigured() : !isConfigured()) {
    return NextResponse.json(
      { error: `${ark ? "ARK_API_KEY" : "OPENROUTER_API_KEY"} is not configured on the server.` },
      { status: 501 }
    );
  }

  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  const image = typeof body.image === "string" && body.image ? body.image : null;
  const stagePhoto = typeof body.stagePhoto === "string" && body.stagePhoto ? body.stagePhoto : null;
  const castIn = Array.isArray(body.cast) ? body.cast : [];
  if (image && stagePhoto) return bad("send either image or stagePhoto, not both");
  if (!image && !stagePhoto && castIn.length === 0) return bad("an image, a stage photo or cast is required");
  if (!stagePhoto && !prompt) return bad("prompt is required");
  if (stagePhoto && castIn.length === 0) return bad("at least one cast assignment is required");

  const cast: { name: string; colorLabel: string; images: string[] }[] = [];
  for (const c of castIn) {
    const images = Array.isArray(c.images) ? c.images.filter((u): u is string => typeof u === "string" && !!u) : [];
    if (typeof c.name !== "string" || !c.name || images.length === 0) return bad("each cast member needs a name and images");
    if (stagePhoto && (typeof c.colorLabel !== "string" || !c.colorLabel)) return bad("each stage cast member needs a colorLabel");
    cast.push({ name: c.name, colorLabel: typeof c.colorLabel === "string" ? c.colorLabel : "", images });
  }

  const counted = cast.map((c) => ({ name: c.name, colorLabel: c.colorLabel, imageCount: c.images.length }));
  const scene = stagePhoto ?? image;
  const fullPrompt = stagePhoto
    ? buildScreenTestPrompt(counted) + (prompt ? `\n\nDIRECTOR'S NOTE: ${prompt}` : "")
    : buildScenePrompt(counted, !!image, prompt);
  const kind = stagePhoto ? "stage" : cast.length ? "cast" : "edit";

  try {
    const result = await (ark ? generateArkImage : generateOpenRouterImage)({
      model,
      prompt: fullPrompt,
      input_references: [...(scene ? [scene] : []), ...cast.flatMap((c) => c.images)].map((url) => ({
        type: "image_url" as const,
        image_url: { url },
      })),
    });
    const out = result.data?.[0];
    if (!out) throw new Error("No image returned");

    const saved = await saveScreenTest(
      `data:${out.media_type};base64,${out.b64_json}`,
      result.usage?.cost ?? IMAGE_PRICE_PER_CALL[model] ?? null,
      { prompt, model, inputs: { kind, cast: cast.map((c) => c.name), image: !!scene } }
    );
    return NextResponse.json(toClientScreenTest(saved));
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Image generation failed" },
      { status: 502 }
    );
  }
}
