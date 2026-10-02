export type ObjectKind = "box" | "ball" | "light" | "camera" | "mannequin";
import type { MannequinPose, Vec3 } from "../../lib/poses/model";
export { DEFAULT_POSE } from "../../lib/poses/model";
export type { JointKey, MannequinPose, Vec3 } from "../../lib/poses/model";

export type Keyframe = {
  time: number;
  position: Vec3;
  rotation: Vec3;
};

export type SceneObject = {
  id: number;
  kind: ObjectKind;
  position: Vec3;
  rotation: Vec3;
  color?: string; // box/ball/mannequin only
  size?: number; // ball radius; box height (Y) and fallback for length/breadth
  length?: number; // box X dimension — defaults to `size` (a cube) when unset
  breadth?: number; // box Z dimension — defaults to `size` (a cube) when unset
  fov?: number; // camera only
  pose?: MannequinPose; // mannequin only — static rig pose, not keyframed
  keyframes?: Keyframe[]; // box/ball/mannequin only, sorted by time
  castId?: string; // mannequin only — id into the /audition roster (src/lib/cast.ts), metadata only for now
};

export const TIMELINE_DURATION = 8; // seconds
export const KEYFRAME_EPSILON = 0.05; // seconds, for "nearest keyframe" lookups
