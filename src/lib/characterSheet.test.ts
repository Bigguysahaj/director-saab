import { describe, it, expect } from "vitest";
import {
  CHARACTER_SHEET_SHOTS,
  GRID_SIZE,
  buildCharacterSheetGridPrompt,
} from "./characterSheet";

describe("character sheet", () => {
  it("has exactly GRID_SIZE² shots so client crops line up", () => {
    expect(CHARACTER_SHEET_SHOTS).toHaveLength(GRID_SIZE * GRID_SIZE);
  });

  it("has unique shot ids", () => {
    const ids = CHARACTER_SHEET_SHOTS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("numbers panels in shot-array order (row-major)", () => {
    const prompt = buildCharacterSheetGridPrompt();
    CHARACTER_SHEET_SHOTS.forEach((s, i) =>
      expect(prompt).toContain(`Panel ${i + 1}: ${s.instruction}`)
    );
  });

  it("states the grid shape", () => {
    expect(buildCharacterSheetGridPrompt()).toContain(
      `${GRID_SIZE}x${GRID_SIZE} grid`
    );
  });
});
