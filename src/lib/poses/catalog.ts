import { resolvePose, type MannequinPose } from "./model";
import type { PoseAsset } from "./library";

const ROTATIONS: Record<string, Partial<MannequinPose>> = {
  Neutral: {},
  "T pose": { leftArm: [0, 0, -Math.PI / 2], rightArm: [0, 0, Math.PI / 2] },
  Wave: { rightArm: [0, 0, 2.2], rightElbow: [-1.2, 0, 0], rightHand: [0, 0, 0.3] },
  Reach: { leftArm: [-1.5, 0, -0.1], rightArm: [-1.5, 0, 0.1], leftElbow: [-0.2, 0, 0], rightElbow: [-0.2, 0, 0] },
  Walk: { leftLeg: [-0.55, 0, 0], rightLeg: [0.45, 0, 0], rightKnee: [0.6, 0, 0], leftArm: [0.5, 0, -0.15], rightArm: [-0.5, 0, 0.15] },
  Point: { rightArm: [-1.4, 0, 0.25], rightElbow: [-0.1, 0, 0], head: [0, 0.2, 0] },
  Cheer: { leftArm: [0, 0, -2.6], rightArm: [0, 0, 2.6], leftElbow: [-0.3, 0, 0], rightElbow: [-0.3, 0, 0], head: [-0.15, 0, 0] },
  Bow: { spine: [0.65, 0, 0], head: [0.25, 0, 0], leftArm: [-0.25, 0, -0.1], rightArm: [-0.25, 0, 0.1] },
  Listen: { head: [0.1, -0.25, 0.12], spine: [0.08, 0, 0], leftElbow: [-0.25, 0, 0], rightElbow: [-0.25, 0, 0] },
  Explain: { leftArm: [-0.35, 0, -0.4], rightArm: [-0.35, 0, 0.4], leftElbow: [-1.2, 0, 0], rightElbow: [-1.2, 0, 0], leftHand: [0, 0, -0.7], rightHand: [0, 0, 0.7] },
  Shrug: { leftArm: [-0.2, 0, -0.5], rightArm: [-0.2, 0, 0.5], leftElbow: [-1.7, 0, 0], rightElbow: [-1.7, 0, 0], head: [0, 0, 0.15] },
  Run: { spine: [0.2, 0, 0], leftLeg: [-0.9, 0, 0], rightLeg: [0.6, 0, 0], leftKnee: [0.45, 0, 0], rightKnee: [1.6, 0, 0], leftArm: [0.7, 0, -0.15], rightArm: [-0.7, 0, 0.15], leftElbow: [-1.4, 0, 0], rightElbow: [-1.4, 0, 0] },
  "Look back": { spine: [0, -0.3, 0], head: [0, -0.8, 0] },
  Sit: { leftLeg: [-Math.PI / 2, 0, 0], rightLeg: [-Math.PI / 2, 0, 0], leftKnee: [Math.PI / 2, 0, 0], rightKnee: [Math.PI / 2, 0, 0], leftElbow: [-1.3, 0, 0], rightElbow: [-1.3, 0, 0] },
};

/** Stable IDs and a rig version let later pose packs target this exact skeleton. */
export const BUILTIN_POSES: PoseAsset[] = Object.entries(ROTATIONS).map(([name, pose]) => ({
  id: `builtin:${name.toLowerCase().replaceAll(" ", "-")}`,
  name,
  pose: resolvePose(pose),
}));
