import { describe, expect, it } from "vitest";
import { ARK_IMAGE_MODELS } from "./imageModels";

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
