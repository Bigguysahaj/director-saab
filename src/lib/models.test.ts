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
});
