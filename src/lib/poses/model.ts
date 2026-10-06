export type Vec3 = [number, number, number];

export type JointKey = "leftArm" | "rightArm" | "leftLeg" | "rightLeg" | "leftElbow" | "rightElbow" | "leftHand" | "rightHand" | "leftKnee" | "rightKnee" | "leftFoot" | "rightFoot" | "spine" | "head";
export type MannequinPose = Record<JointKey, Vec3>;

// Missing joints in older saved poses inherit these neutral rotations.
export const DEFAULT_POSE: MannequinPose = {
  spine: [0, 0, 0], head: [0, 0, 0],
  leftElbow: [0, 0, 0], rightElbow: [0, 0, 0],
  leftHand: [0, 0, 0], rightHand: [0, 0, 0],
  leftKnee: [0, 0, 0], rightKnee: [0, 0, 0],
  leftFoot: [0, 0, 0], rightFoot: [0, 0, 0],
  leftArm: [0, 0, -0.15],
  rightArm: [0, 0, 0.15],
  leftLeg: [0, 0, 0],
  rightLeg: [0, 0, 0],
};

// Joint keys are viewer-side: `left*` sits at the rig's -X while the figure
// faces +Z, i.e. on the figure's own RIGHT (see Mannequin.tsx). Keys stay as-is
// so saved poses and packs keep working; labels use the figure's own side.
export const JOINT_LABELS: Record<JointKey, string> = {
  spine: "Torso", head: "Head / neck",
  rightArm: "Left shoulder", leftArm: "Right shoulder",
  rightElbow: "Left elbow", leftElbow: "Right elbow",
  rightHand: "Left wrist / hand", leftHand: "Right wrist / hand",
  rightLeg: "Left hip", leftLeg: "Right hip",
  rightKnee: "Left knee", leftKnee: "Right knee",
  rightFoot: "Left ankle / foot", leftFoot: "Right ankle / foot",
};

export const JOINTS = Object.keys(DEFAULT_POSE) as JointKey[];

/** Copy all arrays so library assets and live figures never share mutable rotations. */
export function resolvePose(pose: Partial<MannequinPose> = {}): MannequinPose {
  return Object.fromEntries(JOINTS.map((joint) => [joint, [...(pose[joint] ?? DEFAULT_POSE[joint])]])) as MannequinPose;
}

/** Strict boundary for imported assets; omissions use the rig's neutral pose. */
export function parsePose(value: unknown): MannequinPose {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Pose must contain joint rotations.");
  const input = value as Record<string, unknown>;
  for (const [joint, rotation] of Object.entries(input)) {
    if (!JOINTS.includes(joint as JointKey)) throw new Error(`Unknown joint: ${joint}`);
    if (!Array.isArray(rotation) || rotation.length !== 3 || !rotation.every((n) => typeof n === "number" && Number.isFinite(n) && Math.abs(n) <= Math.PI)) {
      throw new Error(`Invalid rotation for ${joint}. Angles must be radians between -π and π.`);
    }
  }
  return resolvePose(input as Partial<MannequinPose>);
}
