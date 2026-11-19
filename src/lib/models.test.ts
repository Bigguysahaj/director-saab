import { describe, expect, it } from "vitest";
import { normalizeModel } from "./models";

describe("normalizeModel video reference support", () => {
  it.each([
    ["bytedance/seedance-2.0", true],
    ["minimax/hailuo-3", true],
    ["minimax/hailuo-3-max", false],
    ["bytedance/seedance-1-5-pro", false],
  ])("%s -> %s", (id, expected) => {
    expect(normalizeModel({ id }).supports_video_reference).toBe(expected);
  });
});

describe("normalizeModel token rates", () => {
  // SKU names as the live OpenRouter catalog returned them on 2026-11-16.
  it("splits the plain rate from the video-input rate", () => {
    const model = normalizeModel({
      id: "bytedance/seedance-2.0-mini",
      pricing_skus: { video_tokens: "0.0000035", video_tokens_without_audio: "0.0000035", video_tokens_with_video_input: "0.0000021" },
    });
    expect(model.token_rate).toBe(0.0000035);
    expect(model.video_input_token_rate).toBe(0.0000021);
  });

  // A "per million" SKU, or any token price >= $0.01, is dollars per million tokens.
  it("scales million-denominated token SKUs down to USD per token", () => {
    const model = normalizeModel({
      id: "bytedance/seedance-2.0-mini",
      pricing_skus: {
        video_tokens_per_million: "3.5",
        video_tokens_with_video_input_per_million: "2.1",
      },
    });
    expect(model.token_rate).toBeCloseTo(0.0000035);
    expect(model.video_input_token_rate).toBeCloseTo(0.0000021);
  });
});

describe("normalizeModel per-second price", () => {
  it("uses the cheapest per-second SKU and treats a cents_ key as cents", () => {
    const model = normalizeModel({
      id: "example/new-video",
      pricing_skus: {
        cents_per_second: "15",
        output_per_second: "0.5",
        per_megapixel_second: "0.001",
        video_tokens: "0.0000035",
      },
    });
    expect(model.price_per_second).toBe(0.15);
  });
});

describe("normalizeModel labels", () => {
  it("derives a label for an unknown id with an empty hyphen segment", () => {
    const model = normalizeModel({ id: "acme--labs/super-clip" });
    expect(model.provider).toContain("Acme");
    expect(model.provider).toContain("Labs");
    expect(model.label).toBe("Super Clip");
    expect(`${model.provider} ${model.label}`).not.toMatch(/undefined/);
  });
});
