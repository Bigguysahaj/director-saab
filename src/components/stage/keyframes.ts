import * as THREE from "three";
import { KEYFRAME_EPSILON, type Keyframe, type Vec3 } from "./types";

function lerpVec3(a: Vec3, b: Vec3, t: number): Vec3 {
  return [
    THREE.MathUtils.lerp(a[0], b[0], t),
    THREE.MathUtils.lerp(a[1], b[1], t),
    THREE.MathUtils.lerp(a[2], b[2], t),
  ];
}

/**
 * Linear, component-wise interpolation between the two keyframes bracketing
 * `t` (consistent with the Euler-angle style used everywhere else in this
 * file — no quaternions). Holds the nearest keyframe's value outside the
 * recorded range instead of extrapolating. Returns null for an empty list so
 * callers can fall back to an object's static position/rotation.
 */
export function interpolateTransform(
  keyframes: Keyframe[] | undefined,
  t: number
): { position: Vec3; rotation: Vec3 } | null {
  if (!keyframes || keyframes.length === 0) return null;
  const sorted = [...keyframes].sort((a, b) => a.time - b.time);
  if (t <= sorted[0].time) return { position: sorted[0].position, rotation: sorted[0].rotation };
  const last = sorted[sorted.length - 1];
  if (t >= last.time) return { position: last.position, rotation: last.rotation };

  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (t >= a.time && t <= b.time) {
      const span = b.time - a.time;
      const localT = span === 0 ? 0 : (t - a.time) / span;
      return { position: lerpVec3(a.position, b.position, localT), rotation: lerpVec3(a.rotation, b.rotation, localT) };
    }
  }
  return { position: last.position, rotation: last.rotation };
}

/** Inserts a keyframe at `time` (snapped to 0.1s), overwriting one already
 * within KEYFRAME_EPSILON rather than creating a duplicate stop. */
export function upsertKeyframe(keyframes: Keyframe[] | undefined, time: number, position: Vec3, rotation: Vec3): Keyframe[] {
  const snapped = Math.round(time * 10) / 10;
  const next = (keyframes ?? []).filter((k) => Math.abs(k.time - snapped) >= KEYFRAME_EPSILON);
  next.push({ time: snapped, position, rotation });
  return next.sort((a, b) => a.time - b.time);
}

/** Removes the keyframe nearest `time` (within KEYFRAME_EPSILON), if any. */
export function deleteKeyframeNear(keyframes: Keyframe[] | undefined, time: number): { keyframes: Keyframe[]; removed: Keyframe | null } {
  if (!keyframes || keyframes.length === 0) return { keyframes: keyframes ?? [], removed: null };
  let nearest: Keyframe | null = null;
  let nearestDist = Infinity;
  for (const k of keyframes) {
    const d = Math.abs(k.time - time);
    if (d < nearestDist) {
      nearest = k;
      nearestDist = d;
    }
  }
  if (!nearest || nearestDist >= KEYFRAME_EPSILON) return { keyframes, removed: null };
  return { keyframes: keyframes.filter((k) => k !== nearest), removed: nearest };
}
