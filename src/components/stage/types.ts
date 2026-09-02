export type ObjectKind = "box" | "ball" | "light" | "camera" | "mannequin";
export type Vec3 = [number, number, number];

export type JointKey = "leftArm" | "rightArm" | "leftLeg" | "rightLeg";
export type MannequinPose = Record<JointKey, Vec3>;

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

// Preserves the mannequin's original hardcoded arm tilt as its rest pose, so
// figures with no explicit pose look identical to before rigging existed.
export const DEFAULT_POSE: MannequinPose = {
  leftArm: [0, 0, 0.15],
  rightArm: [0, 0, -0.15],
  leftLeg: [0, 0, 0],
  rightLeg: [0, 0, 0],
};

export const TIMELINE_DURATION = 8; // seconds
export const KEYFRAME_EPSILON = 0.05; // seconds, for "nearest keyframe" lookups
