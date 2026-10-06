import * as THREE from "three";
import { describe, expect, it } from "vitest";
import type { JointKey } from "./poses/model";
import { projectStageKeypoints, segmentDistance, type StageMannequin } from "./stageKeypoints";

/** Same pivot hierarchy and offsets as Mannequin.tsx, no meshes. */
function buildRig(position: [number, number, number], rotationY = 0, color = "#c65d3b"): { root: THREE.Group; m: StageMannequin } {
  const root = new THREE.Group();
  root.position.set(...position);
  root.rotation.y = rotationY;
  const joints: Partial<Record<JointKey, THREE.Object3D>> = {};
  const pivot = (parent: THREE.Object3D, key: JointKey, p: [number, number, number]) => {
    const g = new THREE.Group();
    g.position.set(...p);
    parent.add(g);
    joints[key] = g;
    return g;
  };
  for (const [side, x] of [["left", -0.12], ["right", 0.12]] as const) {
    const hip = pivot(root, `${side}Leg`, [x, 0.86, 0]);
    const knee = pivot(hip, `${side}Knee`, [0, -0.4, 0]);
    pivot(knee, `${side}Foot`, [0, -0.38, 0]);
  }
  const spine = pivot(root, "spine", [0, 0.86, 0]);
  for (const [side, x] of [["left", -0.27], ["right", 0.27]] as const) {
    const sh = pivot(spine, `${side}Arm`, [x, 0.53, 0]);
    const el = pivot(sh, `${side}Elbow`, [0, -0.29, 0]);
    pivot(el, `${side}Hand`, [0, -0.26, 0]);
  }
  pivot(spine, "head", [0, 0.58, 0]);
  return { root, m: { color, joints } };
}

function cameraLookingAtOrigin(): THREE.PerspectiveCamera {
  const cam = new THREE.PerspectiveCamera(40, 2, 0.1, 100);
  cam.position.set(0, 1, 5);
  cam.lookAt(0, 1, 0);
  return cam;
}

describe("projectStageKeypoints", () => {
  it("projects a camera-facing mannequin with anatomical left on image right", () => {
    const { m } = buildRig([0, 0, 0]);
    const out = projectStageKeypoints(cameraLookingAtOrigin(), [m], [1920, 960]);
    const kp = out.figures[0].keypoints;
    expect(kp.left_shoulder![0]).toBeGreaterThan(0.5);
    expect(kp.right_shoulder![0]).toBeLessThan(0.5);
    // head above shoulders above hips above ankles (image y grows downward)
    expect(kp.head![1]).toBeLessThan(kp.left_shoulder![1]);
    expect(kp.left_shoulder![1]).toBeLessThan(kp.left_hip![1]);
    expect(kp.left_hip![1]).toBeLessThan(kp.left_ankle![1]);
    expect(out.figures[0].depth).toBeGreaterThan(4);
    expect(out.contacts).toEqual([]);
  });

  it("flips sides when the mannequin turns its back to the camera", () => {
    const { m } = buildRig([0, 0, 0], Math.PI);
    const kp = projectStageKeypoints(cameraLookingAtOrigin(), [m], [1920, 960]).figures[0].keypoints;
    expect(kp.left_shoulder![0]).toBeLessThan(kp.right_shoulder![0]);
  });

  it("reports 3D contact only for mannequins that actually touch", () => {
    const a = buildRig([-0.3, 0, 0]).m;
    const near = buildRig([0.3, 0, 0], 0, "#3b6b5c").m; // arms 0.06 apart
    const far = buildRig([2, 0, 0], 0, "#c9a13b").m;
    const out = projectStageKeypoints(cameraLookingAtOrigin(), [a, near, far], [1920, 960]);
    expect(out.contacts).toEqual([[0, 1]]);
  });

  it("measures segment distance", () => {
    const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
    expect(segmentDistance(v(0, 0, 0), v(1, 0, 0), v(0, 1, 0), v(1, 1, 0))).toBeCloseTo(1);
    expect(segmentDistance(v(0, 0, 0), v(1, 0, 0), v(0.5, -1, 0.5), v(0.5, 1, 0.5))).toBeCloseTo(0.5);
    expect(segmentDistance(v(0, 0, 0), v(0, 0, 0), v(3, 4, 0), v(3, 4, 0))).toBeCloseTo(5);
  });
});
