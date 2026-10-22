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
