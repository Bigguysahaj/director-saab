import * as THREE from "three";
import type { JointKey } from "./poses/model";

/**
 * Ground truth for the Screen Test blocking eval (evals/director_eval/
 * screen_test.py): projects each mannequin's live joint pivots through the
 * /stage camera into 2D image coordinates, so a captured stage photo can be
 * saved with an exact "where every mannequin's joints are" JSON beside it
 * instead of the eval having to detect plain mannequins in the photo (pose
 * models don't find them, and the props share the mannequin colors).
 *
 * StageScene's capturePhoto downloads this as `stage-photo-<ts>.json`
 * next to the PNG.
 *
 * Naming: the rig's "left"/"right" (Mannequin.tsx) are as seen by a viewer
 * facing the mannequin — leftArm sits at local -X while the figure faces +Z,
 * which is the figure's own RIGHT. Keypoints here use anatomical names (the
 * person's own left/right), matching MediaPipe Pose, so the mapping below
 * swaps sides.
 */

export const STAGE_KEYPOINTS_SCHEMA = "director-stage-keypoints/v1";

export type KeypointName =
  | "head" | "nose"
  | "left_shoulder" | "right_shoulder" | "left_elbow" | "right_elbow" | "left_wrist" | "right_wrist"
  | "left_hip" | "right_hip" | "left_knee" | "right_knee" | "left_ankle" | "right_ankle";

export type StageKeypoints = {
  schema: typeof STAGE_KEYPOINTS_SCHEMA;
  source: "stage-export";
  image_size: [number, number];
  units: "normalized";
  figures: {
    color: string;
    castId?: string | null;
    depth: number; // camera-to-head distance, scene units
    keypoints: Partial<Record<KeypointName, [number, number] | null>>;
  }[];
  contacts: [number, number][]; // figure index pairs touching in 3D
};

export type StageMannequin = {
  color: string;
  castId?: string | null;
  joints: Partial<Record<JointKey, THREE.Object3D>>;
};

const PIVOT_TO_KEYPOINT: [JointKey, KeypointName][] = [
  ["leftArm", "right_shoulder"], ["rightArm", "left_shoulder"],
  ["leftElbow", "right_elbow"], ["rightElbow", "left_elbow"],
  ["leftHand", "right_wrist"], ["rightHand", "left_wrist"],
  ["leftLeg", "right_hip"], ["rightLeg", "left_hip"],
  ["leftKnee", "right_knee"], ["rightKnee", "left_knee"],
  ["leftFoot", "right_ankle"], ["rightFoot", "left_ankle"],
];

// Offsets inside the head pivot, from Mannequin.tsx (sphere center, nose box).
const HEAD_CENTER = new THREE.Vector3(0, 0.12, 0);
const NOSE = new THREE.Vector3(0, 0.12, 0.145);

// Capsule radii from Mannequin.tsx, used for the 3D contact test.
const SEGMENTS: [KeypointName, KeypointName, number][] = [
  ["left_shoulder", "left_elbow", 0.06], ["left_elbow", "left_wrist", 0.05],
  ["right_shoulder", "right_elbow", 0.06], ["right_elbow", "right_wrist", 0.05],
  ["left_hip", "left_knee", 0.08], ["left_knee", "left_ankle", 0.065],
  ["right_hip", "right_knee", 0.08], ["right_knee", "right_ankle", 0.065],
];
const TORSO_RADIUS = 0.2;
const HEAD_RADIUS = 0.15;
const CONTACT_EPSILON = 0.02;

function project(world: THREE.Vector3, camera: THREE.Camera): [number, number] {
  const ndc = world.clone().project(camera);
  return [(ndc.x + 1) / 2, (1 - ndc.y) / 2];
}

/** Closest distance between segments p1-q1 and p2-q2 (Ericson, RTCD 5.1.9). */
export function segmentDistance(p1: THREE.Vector3, q1: THREE.Vector3, p2: THREE.Vector3, q2: THREE.Vector3): number {
  const d1 = q1.clone().sub(p1);
  const d2 = q2.clone().sub(p2);
  const r = p1.clone().sub(p2);
  const a = d1.dot(d1);
  const e = d2.dot(d2);
  const f = d2.dot(r);
  let s: number;
  let t: number;
  if (a <= 1e-9 && e <= 1e-9) return p1.distanceTo(p2);
  if (a <= 1e-9) {
    s = 0;
    t = THREE.MathUtils.clamp(f / e, 0, 1);
  } else {
    const c = d1.dot(r);
    if (e <= 1e-9) {
      t = 0;
      s = THREE.MathUtils.clamp(-c / a, 0, 1);
    } else {
      const b = d1.dot(d2);
      const denom = a * e - b * b;
      s = denom > 1e-9 ? THREE.MathUtils.clamp((b * f - c * e) / denom, 0, 1) : 0;
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = THREE.MathUtils.clamp(-c / a, 0, 1);
      } else if (t > 1) {
        t = 1;
        s = THREE.MathUtils.clamp((b - c) / a, 0, 1);
      }
    }
  }
  const c1 = p1.clone().addScaledVector(d1, s);
  const c2 = p2.clone().addScaledVector(d2, t);
  return c1.distanceTo(c2);
}

type Capsule = [THREE.Vector3, THREE.Vector3, number];

function capsules(world: Partial<Record<KeypointName, THREE.Vector3>>): Capsule[] {
  const out: Capsule[] = [];
  for (const [a, b, r] of SEGMENTS) {
    if (world[a] && world[b]) out.push([world[a]!, world[b]!, r]);
  }
  const { left_shoulder: ls, right_shoulder: rs, left_hip: lh, right_hip: rh, head } = world;
  if (ls && rs && lh && rh) {
    out.push([ls.clone().add(rs).multiplyScalar(0.5), lh.clone().add(rh).multiplyScalar(0.5), TORSO_RADIUS]);
  }
  if (head) out.push([head, head, HEAD_RADIUS]);
  return out;
}

export function projectStageKeypoints(
  camera: THREE.Camera,
  mannequins: StageMannequin[],
  imageSize: [number, number]
): StageKeypoints {
  camera.updateMatrixWorld();
  const camPos = new THREE.Vector3().setFromMatrixPosition(camera.matrixWorld);
  const worlds: Partial<Record<KeypointName, THREE.Vector3>>[] = [];

  const figures = mannequins.map((m) => {
    const world: Partial<Record<KeypointName, THREE.Vector3>> = {};
    for (const [pivot, name] of PIVOT_TO_KEYPOINT) {
      const obj = m.joints[pivot];
      if (obj) {
        obj.updateWorldMatrix(true, false);
        world[name] = obj.getWorldPosition(new THREE.Vector3());
      }
    }
    const head = m.joints.head;
    if (head) {
      head.updateWorldMatrix(true, false);
      world.head = head.localToWorld(HEAD_CENTER.clone());
      world.nose = head.localToWorld(NOSE.clone());
    }
    worlds.push(world);
    const keypoints: StageKeypoints["figures"][number]["keypoints"] = {};
    for (const [name, v] of Object.entries(world) as [KeypointName, THREE.Vector3][]) {
      keypoints[name] = project(v, camera);
    }
    return {
      color: m.color,
      castId: m.castId ?? null,
      depth: world.head ? world.head.distanceTo(camPos) : NaN,
      keypoints,
    };
  });

  const contacts: [number, number][] = [];
  for (let i = 0; i < worlds.length; i++) {
    for (let j = i + 1; j < worlds.length; j++) {
      const touching = capsules(worlds[i]).some(([p1, q1, r1]) =>
        capsules(worlds[j]).some(([p2, q2, r2]) => segmentDistance(p1, q1, p2, q2) <= r1 + r2 + CONTACT_EPSILON)
      );
      if (touching) contacts.push([i, j]);
    }
  }

  return { schema: STAGE_KEYPOINTS_SCHEMA, source: "stage-export", image_size: imageSize, units: "normalized", figures, contacts };
}
