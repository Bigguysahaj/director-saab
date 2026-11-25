import { describe, expect, it } from "vitest";
import { ARK_IMAGE_MODELS, normalizeImageModel } from "./imageModels";

describe("ARK_IMAGE_MODELS", () => {
  it("contains selectable multi-reference Seedream models", () => {
    expect(ARK_IMAGE_MODELS.map((m) => m.id)).toContain("modelark/seedream-4-5-251128");
    expect(ARK_IMAGE_MODELS.length).toBeGreaterThan(0);
    for (const model of ARK_IMAGE_MODELS) {
      expect(model.id).toMatch(/^modelark\//);
      expect(model.maxInputReferences).toBeGreaterThanOrEqual(2);
    }
  });
});

describe("normalizeImageModel", () => {
  it("splits on the first colon and drops everything after the first sentence", () => {
    expect(normalizeImageModel({
      id: "google/gemini-3.1-flash-lite-image",
      name: "Google: Nano Banana: Lite",
      description: "Fast composites. The rest is not the tagline.",
      supported_parameters: { input_references: { max: 14 } },
    })).toEqual({
      id: "google/gemini-3.1-flash-lite-image",
      label: "Nano Banana: Lite",
      provider: "Google",
      tagline: "Fast composites.",
      maxInputReferences: 14,
    });
  });

  it("derives the provider from the id when the catalog name has no colon", () => {
    expect(normalizeImageModel({ id: "acme/night-shot", name: "Night Shot" })).toEqual({
      id: "acme/night-shot",
      label: "Night Shot",
      provider: "acme",
      tagline: "",
      maxInputReferences: 0,
    });
    expect(normalizeImageModel({ id: "acme/night-shot" })).toMatchObject({
      provider: "acme",
      label: "acme/night-shot",
    });
  });

  it("caps a tagline at 140 characters", () => {
    const description = `${"A".repeat(180)}. Trailing sentence.`;
    expect(normalizeImageModel({ id: "a/b", name: "N", description }).tagline).toBe("A".repeat(140));
    expect(normalizeImageModel({ id: "a/b", name: "N", description: "Ready? More text." }).tagline).toBe("Ready?");
  });
});
