// Acceptance spec for pose keyframes — see docs/handoffs/2026-10-07-pose-keyframes.md.
// Written before the implementation: these fail until it lands.
import { describe, expect, it } from "vitest";
import purseHook from "../../../docs/scenes/purse-hook.json";
import { interpolatePose, upsertKeyframe } from "./keyframes";
import { parseScene } from "./scene";
import { DEFAULT_POSE, type Keyframe } from "./types";

const bent = { ...DEFAULT_POSE, spine: [0.6, 0, 0] as [number, number, number], head: [0.4, 0, 0] as [number, number, number] };
const frames: Keyframe[] = [
  { time: 0, position: [0, 0, 0], rotation: [0, 0, 0], pose: bent },
  { time: 4, position: [0, 0, 0], rotation: [0, 0, 0], pose: DEFAULT_POSE },
];

describe("interpolatePose", () => {
  it("lerps every joint between the bracketing pose keyframes", () => {
    const mid = interpolatePose(frames, 2)!;
    expect(mid.spine[0]).toBeCloseTo(0.3);
    expect(mid.head[0]).toBeCloseTo(0.2);
    expect(mid.leftArm).toEqual(DEFAULT_POSE.leftArm);
  });

  it("holds the first/last pose outside the keyed range", () => {
    expect(interpolatePose(frames, -1)!.spine[0]).toBeCloseTo(0.6);
    expect(interpolatePose(frames, 99)!.spine[0]).toBeCloseTo(0);
  });

  it("returns null when no keyframe carries a pose (static pose applies)", () => {
    expect(interpolatePose([{ time: 0, position: [0, 0, 0], rotation: [0, 0, 0] }], 1)).toBeNull();
    expect(interpolatePose(undefined, 1)).toBeNull();
  });

  it("skips pose-less keyframes instead of snapping to the default pose", () => {
    const mixed: Keyframe[] = [frames[0], { time: 2, position: [1, 0, 0], rotation: [0, 0, 0] }, frames[1]];
    expect(interpolatePose(mixed, 2)!.spine[0]).toBeCloseTo(0.3);
  });

  it("fills joints missing from a partial pose with DEFAULT_POSE", () => {
    const partial: Keyframe[] = [{ time: 0, position: [0, 0, 0], rotation: [0, 0, 0], pose: { spine: [0.5, 0, 0] } as never }];
    expect(interpolatePose(partial, 0)!.leftLeg).toEqual(DEFAULT_POSE.leftLeg);
  });
});

describe("upsertKeyframe with a pose", () => {
  it("stores the pose and replaces it on a nearby re-key", () => {
    const once = upsertKeyframe([], 1, [0, 0, 0], [0, 0, 0], bent);
    expect(once[0].pose?.spine[0]).toBeCloseTo(0.6);
    const again = upsertKeyframe(once, 1.01, [0, 0, 0], [0, 0, 0], DEFAULT_POSE);
    expect(again).toHaveLength(1);
    expect(again[0].pose?.spine[0]).toBeCloseTo(0);
  });

  it("keeps working without a pose (props, camera)", () => {
    expect(upsertKeyframe([], 1, [1, 2, 3], [0, 0, 0])[0].pose).toBeUndefined();
  });
});

describe("scene JSON", () => {
  const mannequin = { id: 1, kind: "mannequin", position: [0, 0, 0], rotation: [0, 0, 0] };

  it("accepts keyframes with a (partial) pose", () => {
    const kf = { time: 1, position: [0, 0, 0], rotation: [0, 0, 0], pose: { spine: [0.4, 0, 0] } };
    expect(parseScene([{ ...mannequin, keyframes: [kf] }])[0].keyframes?.[0].pose).toBeDefined();
  });

  it("rejects unknown joints and non-[x, y, z] joint values", () => {
    const bad = (pose: unknown) => [{ ...mannequin, keyframes: [{ time: 1, position: [0, 0, 0], rotation: [0, 0, 0], pose }] }];
    expect(() => parseScene(bad({ tail: [0, 0, 0] }))).toThrow(/joint/);
    expect(() => parseScene(bad({ spine: [0, 0] }))).toThrow(/joint/);
  });

  it("purse-hook: she starts bent into the purse and is upright by the end", () => {
    const her = parseScene(purseHook).find((o) => o.kind === "mannequin")!;
    expect(interpolatePose(her.keyframes, 0)!.spine[0]).toBeGreaterThan(0.3);
    expect(interpolatePose(her.keyframes, 8)!.spine[0]).toBeLessThan(0.1);
  });
});
