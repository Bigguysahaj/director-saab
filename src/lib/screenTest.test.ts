import { describe, expect, it } from "vitest";
import { buildScreenTestPrompt } from "./screenTest";

describe("buildScreenTestPrompt", () => {
  it("numbers references correctly when members send several images", () => {
    const prompt = buildScreenTestPrompt([
      { name: "Ana", colorLabel: "burnt orange", imageCount: 2 },
      { name: "Ben", colorLabel: "teal", imageCount: 1 },
    ]);
    expect(prompt).toContain("The burnt orange mannequin becomes Ana (the 1st reference person, shown in reference images 2–3)");
    expect(prompt).toContain("The teal mannequin becomes Ben (the 2nd reference person, shown in reference image 4)");
  });
});
