import { describe, expect, it } from "vitest";
import purseHook from "../../../docs/scenes/purse-hook.json";
import { parseScene } from "./scene";

const camera = { id: 1, kind: "camera", position: [0, 1, 2], rotation: [0, 0, 0] };

describe("parseScene", () => {
  it("accepts a bare array or a { schema, objects } wrapper", () => {
    expect(parseScene([camera])).toHaveLength(1);
    expect(parseScene({ schema: "director-stage-scene/v1", objects: [camera] })).toHaveLength(1);
  });

  it("rejects unknown kinds, bad vectors, duplicate ids and out-of-range keyframes", () => {
    expect(() => parseScene([{ ...camera, kind: "dragon" }])).toThrow(/unknown kind/);
    expect(() => parseScene([{ ...camera, position: [0, 1] }])).toThrow(/position/);
    expect(() => parseScene([camera, { ...camera, kind: "box" }])).toThrow(/duplicate id/);
    expect(() =>
      parseScene([{ ...camera, keyframes: [{ time: 99, position: [0, 0, 0], rotation: [0, 0, 0] }] }])
    ).toThrow(/keyframe/);
    expect(() => parseScene([camera, { ...camera, id: 2 }])).toThrow(/one camera/);
  });

  it("loads the purse-hook shot", () => {
    expect(parseScene(purseHook).some((o) => o.kind === "camera" && o.keyframes?.length)).toBe(true);
  });
});
