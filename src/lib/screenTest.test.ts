import { describe, expect, it } from "vitest";
import { buildScenePrompt, buildScreenTestPrompt } from "./screenTest";

describe("buildScreenTestPrompt", () => {
  it("numbers references correctly when members send several images", () => {
    const prompt = buildScreenTestPrompt([
      { name: "Ana", colorLabel: "burnt orange", imageCount: 2 },
      { name: "Ben", colorLabel: "teal", imageCount: 1 },
    ]);
    expect(prompt).toContain("The burnt orange mannequin becomes Ana (the 1st reference person, shown in reference images 2–3)");
    expect(prompt).toContain("The teal mannequin becomes Ben (the 2nd reference person, shown in reference image 4)");
  });

  it("counts a missing image count as one reference, and ordinals keep going past the second person", () => {
    const prompt = buildScreenTestPrompt([
      { name: "Ana", colorLabel: "burnt orange" },
      { name: "Ben", colorLabel: "teal", imageCount: 2 },
      { name: "Cy", colorLabel: "mustard gold", imageCount: 1 },
      { name: "Dee", colorLabel: "slate blue", imageCount: 1 },
    ]);
    expect(prompt).toContain("The burnt orange mannequin becomes Ana (the 1st reference person, shown in reference image 2)");
    expect(prompt).toContain("The teal mannequin becomes Ben (the 2nd reference person, shown in reference images 3–4)");
    expect(prompt).toContain("The mustard gold mannequin becomes Cy (the 3rd reference person, shown in reference image 5)");
    expect(prompt).toContain("The slate blue mannequin becomes Dee (the 4th reference person, shown in reference image 6)");
  });
});

describe("buildScenePrompt", () => {
  it("edits the dropped image alone when nobody is cast", () => {
    expect(buildScenePrompt([], true, "make it night")).toBe(
      "Edit reference image 1. Keep everything not mentioned unchanged and photoreal.\n\nChange: make it night",
    );
  });

  it("starts people at reference image 1 without a scene, and at 2 when the scene is image 1", () => {
    const cast = [
      { name: "Ana", imageCount: 3 },
      { name: "Ben", imageCount: 1 },
    ];
    const bare = buildScenePrompt(cast, false, "a letter");
    expect(bare).toContain("Ana is shown in reference images 1–3");
    expect(bare).toContain("Ben is shown in reference image 4");
    expect(bare).toContain("SCENE: a letter");
    expect(bare).not.toContain("Reference image 1 is the scene");

    const withScene = buildScenePrompt(cast, true, "a letter");
    expect(withScene).toContain("Reference image 1 is the scene or look to use");
    expect(withScene).toContain("Ana is shown in reference images 2–4");
    expect(withScene).toContain("Ben is shown in reference image 5");
  });
});
