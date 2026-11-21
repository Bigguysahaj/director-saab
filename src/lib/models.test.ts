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

  it("trusts an explicit catalog list over the id heuristic", () => {
    expect(normalizeModel({
      id: "minimax/hailuo-3-max",
      supported_input_reference_types: ["image", "video"],
    }).supports_video_reference).toBe(true);

    expect(normalizeModel({
      id: "bytedance/seedance-2.0",
      supported_input_reference_types: ["image"],
    }).supports_video_reference).toBe(false);

    // An empty list is an answer, so the id heuristic must not fill it back in.
    expect(normalizeModel({
      id: "bytedance/seedance-2.0",
      supported_input_reference_types: [],
    }).supports_video_reference).toBe(false);

    expect(normalizeModel({
      id: "other/model",
      input_reference_types: ["video_url"],
    }).supports_video_reference).toBe(true);

    expect(normalizeModel({
      id: "other/model",
      supported_input_modalities: ["text", "video"],
    }).supports_video_reference).toBe(true);

    expect(normalizeModel({
      id: "bytedance/seedance-2.0",
      supported_input_reference_types: "video",
      input_reference_types: ["image"],
    }).supports_video_reference).toBe(false);
  });
});

describe("normalizeModel capability flags", () => {
  it("reads booleans and treats only a non-empty array as supported", () => {
    const model = normalizeModel({
      id: "example/clip",
      supports_generate_audio: true,
      supported_frame_images: ["first"],
      supports_input_references: [],
      supports_seed: false,
      price_per_second: 0.4,
      pricing_skus: { output_per_second: "0.1" },
    });
    expect(model.supports_audio).toBe(true);
    expect(model.supports_frame_images).toBe(true);
    expect(model.supports_input_references).toBe(false);
    expect(model.supports_seed).toBe(false);
    expect(model.price_per_second).toBe(0.4);
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
