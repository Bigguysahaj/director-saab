import { expect, it } from "vitest";
import { deleteKeyframeNear, interpolateTransform, upsertKeyframe } from "./keyframes";
import type { Keyframe } from "./types";
const frames: Keyframe[] = [
  { time: 0, position: [0, 0, 0], rotation: [0, 0, 0] },
  { time: 2, position: [2, 4, 6], rotation: [0.2, 0.4, 0.6] },
];
it("interpolates and holds the ends without modifying input order", () => {
  const reversed = [...frames].reverse();
  expect(interpolateTransform(reversed, 1)?.position).toEqual([1, 2, 3]);
  expect(reversed[0].time).toBe(2);
  expect(interpolateTransform(frames, -1)?.position).toEqual(frames[0].position);
  expect(interpolateTransform(frames, 3)?.position).toEqual(frames[1].position);
  expect(interpolateTransform([], 1)).toBeNull();
});
it("snaps and replaces a nearby keyframe without duplicate timestamps", () => {
  const result = upsertKeyframe(frames, 2.01, [5, 5, 5], [0, 0, 0]);
  expect(result).toHaveLength(2); expect(result[1].position).toEqual([5, 5, 5]);
  expect(frames[1].position).toEqual([2, 4, 6]);
});
it("deletes only a keyframe within the selection tolerance", () => {
  expect(deleteKeyframeNear(frames, 1).removed).toBeNull();
  expect(deleteKeyframeNear(frames, 2.01).keyframes).toEqual([frames[0]]);
});
