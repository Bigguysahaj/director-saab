import { describe, expect, it } from "vitest";
import { DEFAULT_MANNEQUIN_COLOR, STAGE_PALETTE, colorLabel } from "./stageColors";

describe("colorLabel", () => {
  it("names every palette color, ignoring hex case", () => {
    for (const { hex, label } of STAGE_PALETTE) {
      expect(colorLabel(hex)).toBe(label);
      expect(colorLabel(hex.toUpperCase())).toBe(label);
    }
  });

  it("returns a color outside the palette unchanged", () => {
    expect(colorLabel(DEFAULT_MANNEQUIN_COLOR)).toBe(DEFAULT_MANNEQUIN_COLOR);
    expect(colorLabel("#FFFFFF")).toBe("#FFFFFF");
  });
});
